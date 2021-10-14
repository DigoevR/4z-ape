import Logger from "../Utils/Logger";
import Web3 from "web3";
import ChecksLogger from "../Utils/ChecksLogger";

export default class HoneypotChecker {
    private web3: Web3 = new Web3('https://bsc-dataseed.binance.org/');
    private logger: Logger = new Logger('HoneypotChecker', true);

    public isGoodToken(token: string): Promise<boolean> {
        return new Promise<boolean>(async (resolve, reject) => {
            if (process.env.HONEYPOT_CHECK !== 'true') {
                this.logger.log(`${token}: skipped`);
                ChecksLogger.shared.add(token, `Honeypot: skipped`);
                resolve(true);
                return;
            }

            this.web3check(token)
                .then(value => {
                    // this.logger.log(`web3 check: ${value}`);
                    resolve(value);
                })
                .catch(reason => {
                    this.logger.error(`${token}: web3 check failed`, reason);
                    ChecksLogger.shared.add(token, `Honeypot: web3 check failed`);
                    reject(reason);
                });
        });
    }

    private async web3check(token: string): Promise<boolean> {
        let encodedAddress = this.web3.eth.abi.encodeParameter('address', token);
        let contractFuncData = '0xd66383cb';
        let callData = contractFuncData + encodedAddress.substring(2);

        return this.web3.eth.call({
            to: '0x5bf62ec82af715ca7aa365634fab0e8fd7bf92c7',
            from: '0x8894e0a0c962cb723c1976a4421c95949be2d4e3',
            value: 100000000000000000,
            gas: 45000000,
            data: callData,
        })
            .then((val) => {
                this.logger.log(`${token}: OK`);
                ChecksLogger.shared.add(token, `Honeypot: OK`);
                return true;

                // Additional info (in JS from honeypot.is)
                // let decoded = web3.eth.abi.decodeParameters(['uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256'], val);
                // let buyExpectedOut = web3.utils.toBN(decoded[0]);
                // let buyActualOut = web3.utils.toBN(decoded[1]);
                // let sellExpectedOut = web3.utils.toBN(decoded[2]);
                // let sellActualOut = web3.utils.toBN(decoded[3]);
                // let buyGasUsed = web3.utils.toBN(decoded[4]);
                // let sellGasUsed = web3.utils.toBN(decoded[5]);
                // buy_tax = Math.round((buyExpectedOut - buyActualOut) / buyExpectedOut * 100 * 10) / 10;
                // sell_tax = Math.round((sellExpectedOut - sellActualOut) / sellExpectedOut * 100 * 10) / 10;
                // console.log(buy_tax, sell_tax);
                // let maxdiv = '';
                // if(maxTXAmount != 0 || maxSell != 0) {
                //     let n = 'Max TX';
                //     let x = maxTXAmount;
                //     if(maxSell != 0) {
                //         n = 'Max Sell';
                //         x = maxSell;
                //     }
                //     let bnbWorth = '?'
                //     if(maxTxBNB != null) {
                //         bnbWorth = Math.round(maxTxBNB / 10**15) / 10**3;
                //     }
                //     let tokens = Math.round(x / 10**tokenDecimals);
                //     maxdiv = '<p>'+n+': ' + tokens + ' ' + tokenSymbol + ' (~'+bnbWorth+' BNB)</p>';
                // }
            })
            .catch(err => {
                this.logger.error(`${token}: ${err.message}`);
                ChecksLogger.shared.add(token, `Honeypot: ${err.message}`);
                return false;
            });
    }
}
