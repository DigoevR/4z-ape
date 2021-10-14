import Logger from "../Utils/Logger";
import {Log} from "web3-core";
import AbiUtils from "../Utils/AbiUtils";
import {Symbols} from "../../Models/Symbols";
import Web3Helper from "../Web3/Web3Helper";
import Reserve from "../../Models/Reserve";

export default class WatchNewPairs {
    private logger: Logger = new Logger('WatchNewPairs', false);
    private abiDecoder = require('abi-decoder');

    private ignoreNewLogs = true;

    constructor(
        private web3Helper: Web3Helper,
        private onPairFound: (pair: string, token0: string, token1: string, reserve: Reserve) => void
    ) {
        this.abiDecoder.addABI(require('../../ABIs/IPancakeFactoryV2.json'));
        this.abiDecoder.addABI(require('../../ABIs/IPancakeRouterV2.json'));

        this.connect();
    }

    private connect() {
        this.web3Helper.subscribeToEthLogs()
            .on('data', (log) => {
                if (this.ignoreNewLogs) {
                    return;
                }

                this.handleLogs(log).catch((e: any) => {
                    this.logger.error(`Error handling log`, e);
                });
            })
            .on('connected', () => {
                this.logger.log('Listening to PancakeSwap logs');
            })
            .on('error', async (error) => {
                this.logger.error(`Unexpected web3 error`, error);
                this.logger.log(`Trying to reconnect...`);

                await new Promise(resolve => setTimeout(resolve, 500));
                await this.web3Helper.reinit();

                this.connect();
            });
    }

    private async handleLogs(log: Log) {
        const decoded = this.abiDecoder.decodeLogs([log]);
        const values = AbiUtils.decodedEventsToArray(decoded[0]);

        // Non-WBNB pairs are not supported
        if (values.token0 !== Symbols.wbnb && values.token1 !== Symbols.wbnb) {
            // this.logger.log('Received log with non-WBNB pair. Ignoring');
            return;
        }

        // Ger reserve
        const reserve = await this.web3Helper.getReserve(values.pair);

        this.onPairFound(values.pair, values.token0, values.token1, reserve);
    }

    public setIgnoreNewLogs(value: boolean) {
        this.ignoreNewLogs = value;
    }

}
