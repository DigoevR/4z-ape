import Logger from "../Utils/Logger";
import {Position} from "../../Entities";
import {Op} from "sequelize";
import Web3Helper from "../Web3/Web3Helper";
import Pricer from "./Pricer";
import {Symbols} from "../../Models/Symbols";
import BigNumber from "bignumber.js";
import {fromWei} from "web3-utils";
import {PositionAttributes} from "../../Entities/Position";
import AutoSell from "./AutoSell";
import StaySafuChecker from "../Checkers/StaySafuChecker";

export default class ProfitLossManager {
    private logger: Logger = new Logger('ProfitLossManager', false);
    private autoSell: AutoSell = null;

    private isSufficientBalance = false;

    constructor(
        private web3Helper: Web3Helper,
    ) {
        this.autoSell = new AutoSell(this.web3Helper);

        // Delay to beautify logs
        setTimeout(() => {
            this.check();
            setInterval(() => {
                this.check();
            }, parseInt(process.env.PROFIT_LOSS_REPEAT_TIMING));
        }, 1250);
    }

    public setIsSufficientBalance(v: boolean) {
        this.isSufficientBalance = v;
    }

    private check() {
        if (!this.isSufficientBalance) {
            return;
        }

        const date = new Date();
        date.setMinutes(date.getMinutes() - parseInt(process.env.PROFIT_LOSS_RUG_CHECK_TIMING));

        Position.findAll({
            where: {
                openedAt: { [Op.ne]: null },
                closedAt: { [Op.eq]: null },
                profitLossCheckedAt: { [Op.lte]: date },
            }
        }).then((positions) => {
            this.logger.log(`Have ${positions.length} positions to check`);

            positions.forEach(async (position) => {
                const otherSideToken = position.token0 === Symbols.wbnb ? position.token1 : position.token0;

                const tokensRemaining = await this.web3Helper.balanceOf(position.token0 === Symbols.wbnb ? position.token1 : position.token0);
                if (tokensRemaining.eq(0)) {

                    await position.update({
                        closedAt: new Date(),
                        closeReason: 'zero_tokens'
                    });

                    this.logger.log(`${otherSideToken}: 0 tokens remaining. Marking as closed`);
                    return;
                }

                const reserve = await this.web3Helper.getReserve(position.pair);

                const bnbReserve = position.token0 === Symbols.wbnb ? reserve.reserve0 : reserve.reserve1;
                const bnbReserveRemaining = bnbReserve.multipliedBy(100).dividedBy(position.reserveEnter);

                const bnbOut = Pricer.getOutGivenIn(
                    reserve,
                    position.token0 === Symbols.wbnb ? new BigNumber(0) : tokensRemaining,
                    position.token0 === Symbols.wbnb ? tokensRemaining : new BigNumber(0),
                );

                const profitLoss = bnbOut.minus(position.spent);

                this.logger.log(`${otherSideToken}: profit is ${fromWei(profitLoss.toFixed())}`);

                await position.update({
                    profitLoss: profitLoss.toFixed(),
                    profitLossCheckedAt: new Date(),
                    tokenRemaining: tokensRemaining.toFixed(),
                });

                //liquidity unlocked check
                const liquidityLocked = await new StaySafuChecker().checkLiquidity(otherSideToken,false);

                if (!liquidityLocked){
                    this.autoSell.sellIfProfitable(position,true);

                    await position.update({
                        closedAt: new Date(),
                        closeReason: 'rug'
                    });

                    this.logger.log(`${otherSideToken}: liquidity was unlocked, dumped`);
                    return;
                }



                if (bnbReserveRemaining.lte(0.5) && profitLoss.lte(0)) {
                    // less than 0.5% of initial BNB reserve remaining - calling it a rug pull

                    await position.update({
                        closedAt: new Date(),
                        closeReason: 'rug'
                    });

                    this.logger.log(`${otherSideToken}: remainder of original BNB reserve: ${bnbReserveRemaining.toFixed(2)}%. Marking as a rug`)
                    return;
                }

                if (bnbReserveRemaining.gt(0.5)) {
                    this.autoSell.sellIfProfitable(position);
                } else {
                    this.logger.log(`${otherSideToken}: BNB reserve is too low`);
                }

            });
        });
    }
}
