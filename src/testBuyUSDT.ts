import LoadConfig from "./Services/Utils/LoadConfig";
import Web3Helper from "./Services/Web3/Web3Helper";
import Logger from "./Services/Utils/Logger";
import {fromWei, toWei} from "web3-utils";
import SleepSync from "./Services/Utils/SleepSync";

new LoadConfig();

const logger = new Logger('TestBuyUSDT', false);

function testBuyUSDT(web3Helper: Web3Helper) {
    const usdtContract = '0x55d398326f99059ff775485246999027b3197955';

    logger.log(`Buying USDT for 0.001 BNB`);
    web3Helper.swapExactETHForTokens(usdtContract, toWei('0.001'))
        .then((received) => {
            logger.log(`Received ${fromWei(received.toString())} USDT`);
            logger.log('Done');
            SleepSync.ms(2000);
        })
        .catch((error) => {
            logger.error(error);
            logger.log('Done');
            SleepSync.ms(2000);
        });
}

(async () => {
    process.title = 'Test buy USDT';

    const web3Helper = new Web3Helper();
    await web3Helper.init();

    testBuyUSDT(web3Helper)
})();
