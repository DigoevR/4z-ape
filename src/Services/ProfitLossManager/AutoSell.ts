import Web3Helper from "../Web3/Web3Helper";
import BigNumber from "bignumber.js";
import {PositionModel} from "../../Entities/Position";
import Logger from "../Utils/Logger";
import {fromWei, toWei} from "web3-utils";
import {GasEstimates} from "../../Models/GasEstimates";
import {Symbols} from "../../Models/Symbols";

export default class AutoSell
{
    private enabled = process.env.AUTOSELL_PROFITABLE === 'true';
    private minProfit = new BigNumber(toWei(process.env.AUTOSELL_MIN_PROFIT));
    private sellPercentage: number = Number(process.env.AUTOSELL_PERCENTAGE);
    private sellAttemptsCount: number = parseInt(process.env.AUTOSELL_ATTEMPTS_COUNT);
    private defaultGas = toWei(process.env.GAS_PRICE, 'gwei');
    private estimatedTxnFees: BigNumber = null;

    private logger = new Logger('AutoSell', false);

    private sellTokenMutex: Set<string> = new Set<string>();

    constructor(
        private web3Helper: Web3Helper
    ) {
        this.estimatedTxnFees = new BigNumber(GasEstimates.approveReal).multipliedBy(this.defaultGas).plus(
            new BigNumber(GasEstimates.swapReal).multipliedBy(this.defaultGas),
        );
    }

    public sellIfProfitable(position: PositionModel, dumpAll: boolean = false)
    {
        const otherSideToken = position.token0 === Symbols.wbnb ? position.token1 : position.token0;

        if (this.sellTokenMutex.has(otherSideToken)) {
            this.logger.log(`${otherSideToken}: already initiated sell if profitable procedure`);
            return;
        }

        this.sellTokenMutex.add(otherSideToken);


        if (!this.enabled) {
            this.logger.log(`${otherSideToken}: autosell is disabled`);
            this.sellTokenMutex.delete(otherSideToken);
            return;
        }

        if (this.sellAttemptsCount <= 0) {
            this.logger.log(`${otherSideToken}: AUTOSELL_ATTEMPTS_COUNT <= 0`);
            this.sellTokenMutex.delete(otherSideToken);
            return;
        }

        const sellPercentage = dumpAll ? 100 : this.sellPercentage;

        const expectedProceeds = new BigNumber(position.profitLoss)
            .multipliedBy(sellPercentage)
            .dividedBy(100)
            .minus(this.estimatedTxnFees);

        const minProfit = position.soldFor ? new BigNumber(position.soldFor) : this.minProfit;

        if (!dumpAll && expectedProceeds.lt(minProfit)) {
            this.logger.log(`${otherSideToken}: not profitable`);
            this.sellTokenMutex.delete(otherSideToken);
            return;
        }

        this.logger.log(`${otherSideToken}: initiating sell`);

        this.sell(position, sellPercentage, dumpAll, 0);
    }

    public async approve(token: string): Promise<boolean> {
        return new Promise<boolean>(((resolve, reject) => {
            this.web3Helper.approve(token, '-1')
                .then(() => {
                    resolve(true);
                })
                .catch(() => {
                    resolve(false);
                })
        }));
    }

    private async sell(position: PositionModel, sellPercentage: number, dumpAll: boolean, attempt: number) {
        const token = position.token0 === Symbols.wbnb ? position.token1 : position.token0;

        if (attempt >= this.sellAttemptsCount) {
            await position.update({
                closedAt: new Date(),
                closeReason: 'sell_error',
            });
            this.sellTokenMutex.delete(token);
            return;
        }

        if (!position.approved) {
            this.logger.log(`${token}: approving token`);
            const approved = await this.approve(token);
            if (approved) {
                this.logger.log(`${token}: approved`);
                await position.update({
                    approved: true,
                });
            } else {
                if (attempt + 1 < this.sellAttemptsCount) {
                    this.logger.log(`${token}: failed to approve. Trying again...`);
                } else {
                    this.logger.log(`${token}: failed to approve`);
                }
                this.sell(position, sellPercentage, dumpAll, attempt + 1);
                return;
            }
        }

        const sellTokens = new BigNumber(position.tokenRemaining).multipliedBy(sellPercentage).dividedBy(100).integerValue();
        this.web3Helper.swapExactTokensForETHSupportingFeeOnTransferTokens(token, sellTokens.toFixed())
            .then(async (sold) => {
                const remainder = await this.web3Helper.balanceOf(token);
                const previousSoldFor = new BigNumber(position.soldFor ?? 0);
                const totalSoldFor = previousSoldFor.plus(sold);

                if (sellPercentage === 100) {
                    await position.update({
                        tokenRemaining: remainder.toFixed(),
                        soldFor: totalSoldFor.toFixed(),
                        closedAt: new Date(),
                        closeReason: dumpAll ? 'dump-all' : 'sell-all',
                    });
                } else {
                    await position.update({
                        tokenRemaining: remainder.toFixed(),
                        soldFor: totalSoldFor.toFixed(),
                    });
                }

                this.sellTokenMutex.delete(token);

                this.logger.log(`Sold ${sellPercentage}% of ${token} for ${fromWei(sold.toFixed())} BNB (total so far: ${fromWei(totalSoldFor.toFixed())} BNB)`);
            })
            .catch(async (error) =>  {
                if (attempt + 1 < this.sellAttemptsCount) {
                    this.logger.error(`${token}: ${error.message} (${attempt + 1} try). Trying again...`);
                } else {
                    this.logger.error(`${token}: ${error.message} (${attempt + 1} try).`);
                }
                this.sell(position, sellPercentage, dumpAll, attempt + 1);
            });
    }
}
