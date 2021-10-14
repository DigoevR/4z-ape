import LoadConfig from "./Services/Utils/LoadConfig";
import Web3Helper from "./Services/Web3/Web3Helper";
import NewPairApeManager from "./Services/NewPairApeManager/NewPairApeManager";
import Logger from "./Services/Utils/Logger";
import ProfitLossManager from "./Services/ProfitLossManager/ProfitLossManager";
import {fromWei, toWei} from "web3-utils";
import BigNumber from "bignumber.js";
import ChecksLogger from "./Services/Utils/ChecksLogger";

new LoadConfig();

function printEnv() {
    const logger = new Logger('env', false);
    for (const prop in process.env) {
        logger.log(prop + " = " + process.env[prop]);
    }
}

const logger: Logger = new Logger('Bot', false);

const minBalance = toWei(process.env.MIN_BALANCE);

let web3Helper: Web3Helper = null;
let newPairApeManager: NewPairApeManager = null;
let profitLossManager: ProfitLossManager = null;

function checkBalanceLoop() {
    web3Helper.accountBalance()
        .then((balance: BigNumber) => {

            process.title = `4z-ape, balance: ${fromWei(balance.toFixed())} BNB`;

            logger.log(`Current balance: ${fromWei(balance.toFixed())} BNB.`);

            const sufficientBalance = balance.gt(minBalance);
            if (!sufficientBalance) {
                logger.log(`New pairs and profit checks are ignored for ${parseInt(process.env.BALANCE_CHECK_TIMING)/1000} sec due to balance < ${fromWei(minBalance)} BNB.`);
            }

            newPairApeManager.setIsSufficientBalance(sufficientBalance);
            profitLossManager.setIsSufficientBalance(sufficientBalance);

        })
        .catch((error: any) => {
            logger.error(`Error while checking balance: ${error.message}`);
        })
        .finally(() => {
            setTimeout(() => {
                checkBalanceLoop();
            }, parseInt(process.env.BALANCE_CHECK_TIMING));
        });
}

(async () => {
    process.title = `4z-ape`;

    if (process.env.LOG_TO_FILE === 'true') {
        Logger.configureLogFile();
        ChecksLogger.configure();
    }

    printEnv();

    web3Helper = new Web3Helper();
    await web3Helper.init();

    newPairApeManager = new NewPairApeManager(web3Helper);
    profitLossManager = new ProfitLossManager(web3Helper);

    setTimeout(() => {
        checkBalanceLoop();
    }, 250);
})();
