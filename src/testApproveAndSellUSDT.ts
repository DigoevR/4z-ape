import LoadConfig from "./Services/Utils/LoadConfig";
import Web3Helper from "./Services/Web3/Web3Helper";
import Logger from "./Services/Utils/Logger";
import {fromWei} from "web3-utils";
import BigNumber from "bignumber.js";
import {TransactionReceipt} from "web3-core";
import SleepSync from "./Services/Utils/SleepSync";

new LoadConfig();

const logger = new Logger('TestApproveAndSellUSDT', false);

function testApproveAndSellUSDT(web3Helper: Web3Helper) {
    const usdtContract = '0x55d398326f99059ff775485246999027b3197955';

    logger.log(`Retrieving USDT balance`);
    web3Helper.balanceOf(usdtContract)
        .then((value: BigNumber) => {
            logger.log(`USDT balance is ${fromWei(value.toString())}`);

            if (value.gt(0)) {
                logger.log(`Approving ${fromWei(value.toString())} USDT`);

                web3Helper.approve(usdtContract, value.toString())
                    .then((receipt: TransactionReceipt) => {
                        logger.log(`Approved USDT`);
                        logger.log(`Selling ${fromWei(value.toString())} USDT for BNB`);

                        web3Helper.swapExactTokensForETHSupportingFeeOnTransferTokens(usdtContract, value.toString())
                            .then((received) => {
                                logger.log(`Received ${fromWei(received.toString())} BNB`);
                                logger.log('Done');
                                SleepSync.ms(2000);
                            })
                            .catch((error) => {
                                logger.error(error);
                                logger.log('Done');
                                SleepSync.ms(2000);
                            });
                    })
                    .catch((reason: any) => {
                        logger.error(`Error approving USDT`, reason);
                        logger.log('Done');
                        SleepSync.ms(2000);
                    })
            } else {
                logger.log(`Nothing to sell`);
                logger.log('Done');
                SleepSync.ms(2000);
            }

        })
        .catch((reason: any) => {
            logger.error('Error retrieving USDT balance', reason);
            logger.log('Done');
            SleepSync.ms(2000);
        })
}

(async () => {
    process.title = 'Test approve and sell USDT';

    const web3Helper = new Web3Helper();
    await web3Helper.init();

    testApproveAndSellUSDT(web3Helper)
})();
