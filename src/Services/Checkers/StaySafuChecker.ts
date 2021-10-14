import Logger from "../Utils/Logger";
import axios, {AxiosResponse} from "axios";
import ChecksLogger from "../Utils/ChecksLogger";

export default class StaySafuChecker {
    private logger: Logger = new Logger('StaySafuChecker', true);

    private endpoint = 'https://app.staysafu.org/api';

    private liquidityCheckAttempts = 0;




    public isGoodToken(token: string): Promise<boolean> {
        return new Promise<boolean>(async (resolve, reject) => {
            if (process.env.STAYSAFU_CHECK !== 'true') {
                this.logger.log(`${token}: skipped`);
                ChecksLogger.shared.add(token, `StaySafu: skipped`);
                resolve(true);
                return;
            }

            Promise.all(
                [
                    this.checkOwnership(token),
                    this.checkLiquidity(token, true),
                    this.checkSimulateBuy(token),
                    this.checkAnalyseCode(token)
                ],
            ).then(checks => {
                this.logger.log(`${token}: [ownership:${checks[0]},liquidity:${checks[1]},honeypot or high fees:${checks[2]},code:${checks[3]}]`);
                ChecksLogger.shared.add(token, `StaySafu: [ownership:${checks[0]},liquidity:${checks[1]},honeypot or high fees:${checks[2]},code:${checks[3]}]`);

                let result = true;
                checks.forEach((value) => {
                    result = result && value;
                });
                if (result) {
                    this.logger.log(`${token}: OK`);
                    ChecksLogger.shared.add(token, `StaySafu: OK`);
                } else {
                    this.logger.log(`${token}: rejected, didn't pass checks`);
                    ChecksLogger.shared.add(token, `StaySafu: rejected, didn't pass checks`);
                }

                resolve(result);
            }).catch(error => {
                this.logger.error(`${token}: unexpected StaySafuChecker error ${error}`);
                ChecksLogger.shared.add(token, `StaySafu: unexpected error`);
                reject(false);
            });

        });
    }

    public async liquidityLoop(token: string): Promise<boolean> {


        const ownership = await this.checkOwnership(token);
        const simulateBuy = await this.checkSimulateBuy(token);
        const analyseCode = await this.checkAnalyseCode(token);
        const isAlmostGood = ownership && simulateBuy && analyseCode;

        if (!isAlmostGood){
            return false;
        }
        this.logger.log(`${token}: all checks passed, except liquidity, waiting for liqudity to lock`);
        ChecksLogger.shared.add(token, `StaySafu: waiting for liquidity to lock`);
        const maxChecks = parseInt(process.env.AWAIT_LIQUIDITY_LOCK_MAX_CHECKS);
        const checkInterval = parseInt(process.env.AWAIT_LIQUIDITY_LOCK_DELAY);
        let checks = 0;
        let liquidityCheck = false;

        while (checks < maxChecks && liquidityCheck == false) {
            this.liquidityCheckAttempts = 0;
            liquidityCheck = await this.checkLiquidity(token, false);
            checks++;
            await new Promise(resolve => setTimeout(resolve, checkInterval));

        }
        if (liquidityCheck){
            this.logger.log(`${token}: liquidity has been locked, buying`);
            ChecksLogger.shared.add(token, `liquidity has been locked`);
        }
        else{
            this.logger.log(`${token}: liquidity has not been locked`);
            ChecksLogger.shared.add(token, `liquidity has not been locked`);
        }
        return liquidityCheck;
    }


    private async apiGet(token: string, api: string, tokenFieldName: string = 'tokenAddress'): Promise<AxiosResponse> {
        const requestUrl = this.endpoint + `/${api}?${tokenFieldName}=`;
        const maxTries = parseInt(process.env.STAYSAFU_API_CALL_MAX_TRIES);

        let response: AxiosResponse = null;

        let t = 0;
        while (t < maxTries && response === null) {
            try {
                response = await axios.get(requestUrl + token);
            } catch (e) {
                response = null;

                if (t === maxTries - 1) {
                    this.logger.error(`${token}: error accessing ${requestUrl} API (${t+1} try, '${e.message}')`);
                } else {
                    this.logger.error(`${token}: error accessing ${requestUrl} API (${t+1} try, '${e.message}'). Trying again...`);
                }

                await new Promise(resolve => setTimeout(resolve, parseInt(process.env.STAYSAFU_API_CALL_TRY_DELAY)));
            }
            t++;
        }

        return response;
    }

    // Will not work on new tokens
    // private async checkDevTeam(token: string): Promise<boolean> {
    //     const api = 'isclaimed';
    //     const response = await this.apiGet(token, api);
    //
    //     if (response !== null) {
    //         const claimed = response.data.result.claimed;
    //         if (claimed !== undefined && typeof claimed == "boolean") {
    //             this.logger.log(`${token}: claimed - ${claimed}`);
    //
    //             // TODO: Check claimed with dotenv
    //
    //             if (claimed) {
    //                 const tokensLength = response.data.result.tokens.length
    //
    //                 if (tokensLength !== undefined && typeof tokensLength == "number") {
    //                     this.logger.log(`${token}: dev team tokens count - ${tokensLength}`);
    //
    //                     // TODO: Check tokens length with dotenv
    //
    //                     // TODO: ???
    //                     return claimed;
    //                 } else {
    //                     this.logger.error(`${token}: received invalid response from ${api} API`);
    //                     return false;
    //                 }
    //             }
    //
    //             return claimed;
    //         } else {
    //             this.logger.error(`${token}: received invalid response from ${api} API`);
    //             return false;
    //         }
    //     }
    //
    //     return false;
    // }

    // This data is not really needed. Verification checked by bscscan.
    // private async checkTokenData(token: string): Promise<boolean> {
    //     const response = await this.apiGet(token, 'tokendata');
    //     if (response !== null) {}
    //     return false;
    // }

    // CoinGecko data is not really needed.
    // private async checkTokenSentiment(token: string): Promise<boolean> {
    //     const response = await this.apiGet(token, '');
    //     if (response !== null) {}
    //     return false;
    // }

    private async checkOwnership(token: string): Promise<boolean> {
        const api = 'ownership';

        if (process.env.STAYSAFU_OWNERSHIP_CHECK !== 'true') {
            this.logger.log(`${token}: ${api} - skipped`);
            ChecksLogger.shared.add(token, `StaySafu: ${api} - skipped`);
            return true;
        }


        const response = await this.apiGet(token, api);

        if (response !== null) {
            const ownership = response.data.result;

            // renounced: {"result":true}
            // none: {"result":false}
            // owned: {"result":"0x.."}

            if (ownership !== undefined) {
                let ownershipResult = '';

                switch (typeof ownership) {
                    case "string":
                        ownershipResult = 'owned';
                        break;
                    case "boolean":
                        if (ownership) {
                            ownershipResult = 'renounced';
                        } else {
                            ownershipResult = 'none';
                        }
                        break;
                    default:
                        this.logger.error(`${token}: received invalid ownership type from /${api} API`);
                        return false;
                }

                this.logger.log(`${token}: ownership - ${ownershipResult}`);
                ChecksLogger.shared.add(token, `StaySafu: ownership - ${ownershipResult}`);

                const allowedResults: Array<string> = process.env.STAYSAFU_OWNERSHIP_TARGETS.split(",");
                return allowedResults.indexOf(ownershipResult) > -1;
            } else {
                this.logger.error(`${token}: received invalid response from /${api} API`);
                return false;
            }
        } else {
            this.logger.error(`${token}: unable to reach /${api} API`);
            return false;
        }

        return false;
    }

    // Slow, every holders request ~ 2 sec
    public async checkLiquidity(token: string, performHoldersCheck: boolean): Promise<boolean> {
        const api = 'liqlocked';
        const holdersApi = 'holders'

        if (process.env.STAYSAFU_LIQUIDITY_CHECK !== 'true') {
            this.logger.log(`${token}: ${holdersApi} and ${api} - skipped`);
            ChecksLogger.shared.add(token, `StaySafu: ${holdersApi} and ${api} - skipped`);
            return true;
        }


        this.liquidityCheckAttempts++;
        if (this.liquidityCheckAttempts > parseInt(process.env.STAYSAFU_LIQUIDITY_MAX_TRIES)) {
            this.logger.log(`${token}: liquidity - no pool`);
            ChecksLogger.shared.add(token, `StaySafu: liquidity - no pool`);
            return false;
        }

        await new Promise(resolve => setTimeout(resolve, parseInt(process.env.STAYSAFU_LIQUIDITY_TRY_DELAY)));

        if (performHoldersCheck) {
            const holdersResponse = await this.apiGet(token, holdersApi);
            if (holdersResponse !== null) {
                // this.logger.log(JSON.stringify(holdersResponse.data));

                const holdersLiquidityExists = holdersResponse.data.result.liquidity;
                if (holdersLiquidityExists !== undefined && typeof holdersLiquidityExists == "boolean") {
                    if (!holdersLiquidityExists) {
                        return this.checkLiquidity(token, true);
                    }
                } else {
                    this.logger.error(`${token}: received invalid response from /${holdersApi} API`);
                    return false;
                }
            } else {
                this.logger.error(`${token}: unable to reach /${holdersApi} API`);
                return false;
            }
        }

        // --------

        const response = await this.apiGet(token, api);

        if (response !== null) {
            // this.logger.log(JSON.stringify(response.data));

            let liquidityResult = '';

            const status = response.data.result.status;
            if (status !== undefined && typeof status == "string") {
                if (status !== 'success') {
                    // no pool
                    // this.logger.log(`${token}: liquidity - no pool`);
                    // ChecksLogger.shared.add(token, `StaySafu: liquidity - no pool`);
                    // liquidityResult = 'nopool';
                    return this.checkLiquidity(token, false);
                } else {
                    const risk = response.data.result.riskAmount;

                    if (risk !== undefined && typeof risk == "number") {
                        if (risk < 10) {
                            // locked
                            this.logger.log(`${token}: liquidity - locked`);
                            liquidityResult = 'locked';
                        } else {
                            // unlocked
                            this.logger.log(`${token}: liquidity - unlocked`);
                            liquidityResult = 'unlocked';
                        }
                    } else {
                        this.logger.error(`${token}: received invalid risk amount from /${api} API`);
                        return false;
                    }
                }

                ChecksLogger.shared.add(token, `StaySafu: liquidity - ${liquidityResult}`);

                const allowedResults: Array<string> = process.env.STAYSAFU_LIQUIDITY_TARGETS.split(",");
                return allowedResults.indexOf(liquidityResult) > -1;
            } else {
                this.logger.error(`${token}: received invalid status response from /${api} API`);
                return false;
            }
        } else {
            this.logger.error(`${token}: unable to reach /${api} API`);
            return false;
        }

        return false;
    }

    // Slow on site
    // private async checkHolders(token: string): Promise<boolean> {
    //     const response = await this.apiGet(token, '');
    //     if (response !== null) {}
    //     return false;
    // }
    // private async checkCreatedTokens(token: string): Promise<boolean> {
    //     const response = await this.apiGet(token, '');
    //     if (response !== null) {}
    //     return false;
    // }

    private async checkSimulateBuy(token: string): Promise<boolean> {
        const api = 'simulatebuy';

        if (process.env.STAYSAFU_SIMULATE_BUY !== 'true') {
            this.logger.log(`${token}: ${api} - skipped`);
            ChecksLogger.shared.add(token, `StaySafu: ${api} - skipped`);
            return true;
        }


        const response = await this.apiGet(token, api);

        if (response !== null) {
            const simulate = response.data.result;

            if (simulate.error == false) {
                if (simulate.isHoneypot == false) {
                    this.logger.log(`${token}: honeypot (StaySafu) - no`);
                    ChecksLogger.shared.add(token, `StaySafu: honeypot - no`);
                    if (simulate.buyFee <= process.env.STAYSAFU_MAX_BUY_FEE && simulate.sellFee <= process.env.STAYSAFU_MAX_SELL_FEE) {
                        this.logger.log(`${token}: high fees - no`);
                        ChecksLogger.shared.add(token, `StaySafu: high fees - no`);
                        return true;
                    }
                    else {
                        this.logger.log(`${token}: high fees - yes`);
                        ChecksLogger.shared.add(token, `StaySafu: high fees - yes`);
                        return false;
                    }
                } else {
                    this.logger.log(`${token}: honeypot (StaySafu) - yes`);
                    ChecksLogger.shared.add(token, `StaySafu: honeypot - yes`);
                    return false;
                }
            } else {
                this.logger.error(`${token}: received error from /${api} API, probably honeypot`);
                return false;
            }
        } else {
            this.logger.error(`${token}: unable to reach /${api} API`);
            return false;
        }

        return false;
    }

    private async checkAnalyseCode(token: string): Promise<boolean> {
        const api = 'analysecode';

        if (process.env.STAYSAFU_CODE_CHECK !== 'true') {
            this.logger.log(`${token}: ${api} - skipped`);
            ChecksLogger.shared.add(token, `StaySafu: ${api} - skipped`);
            return true;
        }


        const response = await this.apiGet(token, api);

        if (response !== null) {
            const verified = response.data.result.verified;

            if (verified !== undefined && typeof verified == "boolean") {
                if (verified) {
                    const detectedScams = response.data.result.detectedScams;

                    if (detectedScams !== undefined && typeof detectedScams == "object") {
                        // const isMintScam = detectedScams
                        //     .map((scam) => scam.type)
                        //     .includes('mint')
                        // const isHoneypotScam = detectedScams
                        //     .map((scam) => scam.type)
                        //     .includes('honeypot')
                        // const isDisableTradingScam = detectedScams
                        //     .map((scam) => scam.type)
                        //     .includes('disableTrading')
                        // const isBlacklistScam = detectedScams
                        //     .map((scam) => scam.type)
                        //     .includes('blacklist')
                        // const isMaxSellScam = detectedScams
                        //     .map((scam) => scam.type)
                        //     .includes('maxSell')
                        // const isMaxTXScam = detectedScams
                        //     .map((scam) => scam.type)
                        //     .includes('maxTX')

                        if (detectedScams.length === 0) {
                            this.logger.log(`${token}: code - verified, no scams detected`);
                            ChecksLogger.shared.add(token, `StaySafu: code - verified, no scams detected`);
                            return true;
                        } else {
                            const scamsSet: Set<string> = new Set<string>();

                            detectedScams
                                .map((scam: any) => {
                                    const t = scam.type;
                                    if (t !== undefined && typeof t == "string") {
                                        scamsSet.add(t);
                                    } else {
                                        this.logger.error(`${token}: received invalid scam type from /${api} API`);
                                    }
                                });

                            this.logger.log(`${token}: code - verified, scams: ${Array.from(scamsSet).join(',')}`);
                            ChecksLogger.shared.add(token, `StaySafu: code - verified, scams: ${Array.from(scamsSet).join(',')}`);
                            return false;
                        }
                    } else {
                        this.logger.error(`${token}: received invalid detected scams from /${api} API`);
                        return false;
                    }
                } else {
                    this.logger.log(`${token}: code - not verified`);
                    return false;
                }
            } else {
                this.logger.error(`${token}: received invalid response from /${api} API`);
                return false;
            }
        } else {
            this.logger.error(`${token}: unable to reach /${api} API`);
            return false;
        }

        return false;
    }
}
