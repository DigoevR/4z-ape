import Web3Helper from "../Web3/Web3Helper";
import {PositionModel} from "../../Entities/Position";
import Pricer from "./Pricer";
import {Symbols} from "../../Models/Symbols";
import BigNumber from "bignumber.js";
import {toWei} from "web3-utils";
import {GasEstimates} from "../../Models/GasEstimates";
import AutoSell from "./AutoSell";
import Logger from "../Utils/Logger";
import {Op} from "sequelize";
import {Position} from "../../Entities";

export default class DumpAll {
    private defaultGas = toWei(process.env.GAS_PRICE, 'gwei');
    private estimatedTxnFees: BigNumber = null;
    private autoSell: AutoSell = null;
    private logger = new Logger('DumpAll', false);

    constructor(
        private web3Helper: Web3Helper,
    ) {
        this.autoSell = new AutoSell(this.web3Helper);

        this.estimatedTxnFees = new BigNumber(GasEstimates.approveReal).multipliedBy(this.defaultGas).plus(
            new BigNumber(GasEstimates.swapReal).multipliedBy(this.defaultGas),
        );
    }

    public dumpAll(onDumped: () => void) {
        Position.findAll({
            where: {
                tokenRemaining: { [Op.gt]: 0 },
                openedAt: { [Op.ne]: null },
                closedAt: { [Op.eq]: null },
            }
        }).then((positions) => {
            let promises: Array<Promise<boolean>> = new Array<Promise<boolean>>();
            for (const position of positions) {
                promises.push(this.dump(position));
            }
            Promise.all(promises)
                .then(value => {
                    onDumped();
                })
        }).catch(reason => {
            this.logger.error(reason);
            onDumped();
        });
    }

    public dumpSingle(pair: string)
    {
        Position.findOne({
            where: {
                pair: pair,
            },
        }).then((position) => {
            this.dump(position)
                .then((dumped) => {
                    this.logger.log(`Dumped ${pair}`);
                    if (!dumped) {
                        this.logger.error(`Failed to dump ${pair} - not profitable`);
                        return;
                    }
                })
                .catch((error) => {
                    this.logger.error(`Error while dumping: ${error.message}`);
                });
        });
    }

    private dump(position: PositionModel) {
        return new Promise<boolean>(async (resolve) => {
            const reserve = await this.web3Helper.getReserve(position.pair);

            if (reserve.reserve0.eq(0) && reserve.reserve1.eq(0)) {
                resolve(false);
                return;
            }

            const bnbOut = Pricer.getOutGivenIn(
                reserve,
                position.token0 === Symbols.wbnb ? new BigNumber(0) : new BigNumber(position.tokenRemaining),
                position.token0 === Symbols.wbnb ? new BigNumber(position.tokenRemaining) : new BigNumber(0),
            );

            if (bnbOut.minus(this.estimatedTxnFees).lte(0)) {
                resolve(false);
                return;
            }

            this.logger.log(`Dumping ${position.pair}`);
            this.autoSell.sellIfProfitable(position, true);

            resolve(true);
        });
    }
}
