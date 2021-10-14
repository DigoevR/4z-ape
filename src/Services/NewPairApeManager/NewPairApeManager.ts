import Web3Helper from "../Web3/Web3Helper";
import Logger from "../Utils/Logger";
import WatchNewPairs from "./WatchNewPairs";
import {Symbols} from "../../Models/Symbols";
import {fromWei, toWei} from "web3-utils";
import BscScanChecker from "../Checkers/BscScanChecker";
import StaySafuChecker from "../Checkers/StaySafuChecker";
import HoneypotChecker from "../Checkers/HoneypotChecker";
import Ape from "./Ape";
import TokenChecker from "../Checkers/TokenChecker";
import ChecksLogger from "../Utils/ChecksLogger";

export default class NewPairApeManager {
    private logger: Logger = new Logger('NewPairApeManager', false);

    private newPairWatcher: WatchNewPairs = null;

    private minReserve = toWei(process.env.MIN_RESERVE);

    private isSufficientBalance = false;

    constructor(
        private web3Helper: Web3Helper
    ) {
        this.newPairWatcher = new WatchNewPairs(
            web3Helper,
            (pair, t0, t1, reserve) => {
                // await new Promise(resolve => setTimeout(resolve, 240000));

                const bnbReserve = t0 === Symbols.wbnb ? reserve.reserve0 : reserve.reserve1;
                const otherSideToken = t0 === Symbols.wbnb ? t1 : t0

                this.logger.log(`New token: ${otherSideToken} (pair: ${pair}). BNB reserve: ${fromWei(bnbReserve.toFixed())}`);

                ChecksLogger.shared.add(otherSideToken, `Pair: ${pair}`);
                ChecksLogger.shared.add(otherSideToken, `BNB reserve: ${fromWei(bnbReserve.toFixed())}`);

                if (bnbReserve.lte(this.minReserve)) {
                    this.logger.log(`${otherSideToken}: rejected, reserve is too low, must be > ${fromWei(this.minReserve)}`);

                    ChecksLogger.shared.add(otherSideToken, `Reserve is too low, must be > ${fromWei(this.minReserve)}`);
                    ChecksLogger.shared.add(otherSideToken, `Rejected`);

                    ChecksLogger.shared.flush(otherSideToken);
                    return;
                }

                new TokenChecker().isGoodToken(otherSideToken).then((isGood) => {
                    if (isGood) {
                        this.logger.log(`${otherSideToken}: accepted, aping in`);
                        ChecksLogger.shared.add(otherSideToken, `Accepted, aped in`);

                        new Ape(this.web3Helper, pair, t0, t1, reserve).in();
                    } else {
                        this.logger.log(`${otherSideToken}: rejected, didn't pass checks`);
                        ChecksLogger.shared.add(otherSideToken, `Rejected`);
                    }

                    ChecksLogger.shared.flush(otherSideToken);
                });
            });
    }

    public setIsSufficientBalance(v: boolean) {
        this.isSufficientBalance = v;
        this.newPairWatcher.setIgnoreNewLogs(!this.isSufficientBalance);
    }
}