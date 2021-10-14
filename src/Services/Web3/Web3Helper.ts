import Web3 from "web3";
import {Account, Log, TransactionConfig, TransactionReceipt} from "web3-core";
import {fromWei, toWei} from "web3-utils";
import Logger from "../Utils/Logger";
import BigNumber from "bignumber.js";
import AbiUtils from "../Utils/AbiUtils";
import {Symbols} from "../../Models/Symbols";
import Reserve from "../../Models/Reserve";
import Web3Factory from "./Web3Factory";
import {Topics} from "../../Models/Topics";
import {Subscription} from 'web3-core-subscriptions';
import {GasEstimates} from "../../Models/GasEstimates";

export default class Web3Helper {
    private web3: Web3 = null
    private account: Account = null;
    private nonce: number = null;
    private logger: Logger = new Logger('Web3Helper', false);
    private routerAddress: string = process.env.ROUTER_ADDRESS;
    private abiDecoder = require('abi-decoder');
    private defaultGas = toWei(process.env.GAS_PRICE, 'gwei');

    constructor() {
        this.abiDecoder.addABI(require('../../ABIs/IPancakePair.json'));
    }

    public async init() {
        this.web3 = Web3Factory.make()

        this.account = this.web3.eth.accounts.privateKeyToAccount(process.env.ACCOUNT_PK);
        this.nonce = await this.web3.eth.getTransactionCount(this.account.address);

        this.logger.log(`Nonce: ${this.nonce}`);
    }

    public async reinit() {
        this.web3.eth.clearSubscriptions(() => {});
        await this.init();
    }

    public subscribeToEthLogs(): Subscription<Log> {
        return this.web3.eth.subscribe('logs', {
            address: process.env.FACTORY_ADDRESS,
            topics: [Topics.PairCreated],
        });
    }

    public swapExactETHForTokens(token: string, amount: string) {
        return new Promise<BigNumber>((resolve, reject) => {
            const contract = this.routerContract();
            // @ts-ignore
            const methodCall = contract.methods.swapExactETHForTokens(
                '0',
                [Symbols.wbnb, token],
                this.account.address,
                this.deadline(),
            );

            this.sendSigned(this.account, this.routerAddress, GasEstimates.swapTX, this.defaultGas, methodCall, amount)
                .then((receipt) => {
                    const decodedLogs = this.abiDecoder.decodeLogs(receipt.logs);
                    const swapped = this.getSwappedAmount(decodedLogs);
                    if (swapped) {
                        resolve(swapped);
                        return;
                    }

                    this.logger.error(`Failed to decode swapped amount for txn ${receipt.transactionHash}`);
                    reject(new Error(`Failed to decode swapped amount for txn ${receipt.transactionHash}`));
                })
                .catch((error) => {
                    reject(error);
                });
        });
    }

    public accountBalance() {
        return new Promise<BigNumber>((resolve, reject) => {
            this.web3.eth.getBalance(this.account.address)
                .then((balance) => {
                    resolve(new BigNumber(balance));
                })
                .catch((error) => {
                    reject(error);
                });
        });
    }

    public balanceOf(token: string) {
        return new Promise<BigNumber>((resolve, reject) => {
            const contract = this.tokenContract(token);
            contract.methods.balanceOf(this.account.address).call()
                .then((result: string) => {
                    resolve(new BigNumber(result));
                })
                .catch((error: any) => {
                    reject(error);
                })
        });
    }

    public approve(token: string, amount: string) {
        if (amount === '-1') {
            // MAX_INT
            amount = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
        }

        return new Promise<TransactionReceipt>((resolve, reject) => {
            const contract = this.tokenContract(token);
            const methodCall = contract.methods.approve(
                this.routerAddress,
                amount,
            );

            this.sendSigned(this.account, token, GasEstimates.approveTX, this.defaultGas, methodCall)
                .then((receipt) => {
                    resolve(receipt);
                })
                .catch((error) => {
                    reject(error);
                })
        });
    }

    public swapExactTokensForETHSupportingFeeOnTransferTokens(token: string, amount: string) {
        return new Promise<BigNumber>((resolve, reject) => {
            const contract = this.routerContract();
            // @ts-ignore
            const methodCall = contract.methods.swapExactTokensForETHSupportingFeeOnTransferTokens(
                amount,
                '0',
                [token, Symbols.wbnb],
                this.account.address,
                this.deadline(),
            );

            this.sendSigned(this.account, this.routerAddress, GasEstimates.swapTX, this.defaultGas, methodCall)
                .then((receipt) => {
                    const decodedLogs = this.abiDecoder.decodeLogs(receipt.logs);
                    const swapped = this.getSwappedAmount(decodedLogs);
                    if (swapped) {
                        resolve(swapped);
                        return;
                    }

                    this.logger.error(`Failed to decode swapped amount for txn ${receipt.transactionHash}`);
                    reject(new Error(`Failed to decode swapped amount for txn ${receipt.transactionHash}`));
                })
                .catch((error) => {
                    reject(error);
                });
        });
    }

    public sendSigned(account: Account, to: string, gas: string, gasPrice: string, methodCall: any, value: string = '0') {
        return new Promise<TransactionReceipt>(async (resolve, reject) => {
            const encodedABI = methodCall.encodeABI();
            const tx: TransactionConfig = {
                from: account.address,
                to: to,
                gas: gas,
                data: encodedABI,
                value: value,
                gasPrice: gasPrice,
            };
            if (this.nonce !== null) {
                // @ts-ignore
                tx.nonce = this.nonce;
                this.nonce++;
            }

            const signedTx = await account.signTransaction(tx);

            let txnSubmitted = false;
            let hash: string = null;

            this.web3.eth.sendSignedTransaction(signedTx.rawTransaction)
                .on('transactionHash', (h: string) => {
                    txnSubmitted = true;
                    hash = h;
                    this.logger.log(`Txn Hash ${hash} (${fromWei(gasPrice, 'gwei')}gwei) (nonce: ${tx.nonce ? Number(tx.nonce) : '-'})`);
                })
                .on('receipt', (receipt) => {
                    resolve(receipt);
                })
                .on('error', async (error: any) => {
                    if (!txnSubmitted && error.message.indexOf('insufficient funds for gas') !== -1) {
                        this.nonce--;
                    }

                    if (!txnSubmitted && error.message.toLowerCase().indexOf('nonce too low') !== -1) {
                        this.logger.error(`Error: ${error.message}. Retrying...`);

                        this.nonce = await this.web3.eth.getTransactionCount(this.account.address);
                        this.sendSigned(account, to, gas, gasPrice, methodCall, value)
                            .then((retryResult) => { resolve(retryResult); })
                            .catch((retryError) => reject(retryError));
                        return;
                    }

                    // https://github.com/ChainSafe/web3.js/issues/1102
                    if (txnSubmitted && hash !== null) {
                        this.logger.log(`Explicitly waiting for the receipt (tx: ${hash})`);

                        let receipt: TransactionReceipt = null;
                        let maxTries = parseInt(process.env.TRANSACTION_RECEIPT_MAX_TRIES); //10 default
                        let tries = 0;

                        while (tries < maxTries && receipt === null) {
                            await new Promise(resolve => setTimeout(resolve, parseInt(process.env.TRANSACTION_RECEIPT_TRY_DELAY)));
                            receipt = await this.web3.eth.getTransactionReceipt(hash);
                            tries++;
                        }

                        if (receipt !== null) {
                            resolve(receipt);
                        }
                    }

                    this.logger.error(`Error: ${error.message}`);
                    reject(error);
                });
        });
    }

    public getReserve(pair: string) {
        return new Promise<Reserve>((resolve, reject) => {
            const pairContract = new this.web3.eth.Contract(require('../../ABIs/IPancakePair.json'), pair);
            pairContract.methods.getReserves().call()
                .then((result: any) => {
                    resolve(new Reserve(result[0], result[1]));
                })
                .catch((error: any) => {
                    reject(error);
                });
        });
    }

    private routerContract() {
        return new this.web3.eth.Contract(require('../../ABIs/IPancakeRouterV2.json'), this.routerAddress);
    }

    private tokenContract(token: string) {
        return new this.web3.eth.Contract(require('../../ABIs/IBEP20.json'), token);
    }

    private getSwappedAmount(decodedLogs: any): BigNumber {
        let swappedAmount: BigNumber = null;
        decodedLogs.forEach((log: any) => {
            if (log.name !== 'Swap') {
                return;
            }

            const props = AbiUtils.decodedEventsToArray(log);
            swappedAmount = new BigNumber(props.amount0In === '0' ? props.amount0Out : props.amount1Out);
        });

        return swappedAmount;
    }

    private deadline() {
        return Math.round(new Date().getTime() / 1000) + 30;
    }
}
