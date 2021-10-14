import Logger from "../Utils/Logger";
import axios, {AxiosResponse} from "axios";
import ChecksLogger from "../Utils/ChecksLogger";

export default class BscScanChecker {
    private logger: Logger = new Logger('BscScanChecker', true);

    private offendingWords: string[] = [
        'Handling Request',
        'require(txoo && !bl[msg.sender])',
        'FOR VALUE PROTECTION, YOU CAN ONLY SELL',
        'Syntax Error. Please Re-Submit Order',
        'Error: Can not sell this token',
        'SLAVETAX',
        '"please wait"',
        '"Not you"',
        'account is freez',
        'Transaction amount exceeds the configured limit',
        'Tokens cannot be transferred',
        'sefhi = 2 weeks',
        '"Tokens are here"',
        '[account] = 1;',
    ];

    public isGoodToken(token: string): Promise<boolean> {
        return new Promise<boolean>(async (resolve, reject) => {
            if (process.env.BSSCAN_CHECK !== 'true') {
                this.logger.log(`${token}: skipped`);
                ChecksLogger.shared.add(token, `BscScan: skipped`);
                resolve(true);
                return;
            }

            if (!process.env.BSCSCAN_API_KEY) {
                this.logger.error('BSCSCAN_API_KEY not set')
                process.exit(0);
            }

            let response: AxiosResponse = null;
            try {
                response = await axios.get(`https://api.bscscan.com/api?module=contract&action=getsourcecode&address=${token.toLowerCase()}&apikey=${process.env.BSCSCAN_API_KEY}`);
            } catch (e) {
                this.logger.error(`${token}: error accessing https://api.bscscan.com/ API`, e);
                ChecksLogger.shared.add(token, `BscScan: error accessing API`);
                reject(false);
                return;
            }

            if (response.data.message === 'OK') {
                for (const sourceObj of response.data.result) {
                    if (!sourceObj.SourceCode) {
                        if (process.env.BSSCAN_ALLOW_UNVERIFIED_TOKENS === 'true') {
                            this.logger.log(`${token}: OK`);
                            ChecksLogger.shared.add(token, `BscScan: OK`);
                            resolve(true);
                            return;
                        }

                        this.logger.log(`${token}: contract not verified`);
                        ChecksLogger.shared.add(token, `BscScan: contract not verified`);
                        resolve(false);
                        return;
                    }

                    for (const word of this.offendingWords) {
                        if (sourceObj.SourceCode.indexOf(word) !== -1) {
                            this.logger.log(`${token}: contains "${word}" - a big no-no!`);
                            ChecksLogger.shared.add(token, `BscScan: contains "${word}" - a big no-no!`);
                            resolve(false);
                            return;
                        }
                    }
                }

                this.logger.log(`${token}: OK`);
                ChecksLogger.shared.add(token, `BscScan: OK`);
                resolve(true);
                return;
            }

            if (process.env.BSSCAN_ALLOW_UNVERIFIED_TOKENS === 'true') {
                this.logger.log(`${token}: OK`);
                ChecksLogger.shared.add(token, `BscScan: OK`);
                resolve(true);
                return;
            }

            if (response.data.message === 'NOTOK' && response.data.result === 'Contract source code not verified') {
                this.logger.log(`${token}: contract not verified`);
                ChecksLogger.shared.add(token, `BscScan: contract not verified`);
                resolve(false);
                return;
            }

            this.logger.error(`${token}: not configured correctly on bscscan`);
            ChecksLogger.shared.add(token, `BscScan: contract not configured correctly on bscscan`);
            reject(false);
        });
    }
}
