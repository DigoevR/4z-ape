import LoadConfig from "./Services/Utils/LoadConfig";
import DumpAll from "./Services/ProfitLossManager/DumpAll";
import Web3Helper from "./Services/Web3/Web3Helper";
import * as minimist from "minimist";
import Logger from "./Services/Utils/Logger";
import SleepSync from "./Services/Utils/SleepSync";

// parse args
const args = minimist(process.argv, {
    string: ['single'],
});

new LoadConfig();

const logger = new Logger('DumpAll', false);

(async () => {
    process.title = `Dump all`;

    const web3Helper = new Web3Helper();
    await web3Helper.init();

    const dumper = new DumpAll(web3Helper);
    if (args.single) {
        dumper.dumpSingle(args.single);
        return;
    }

    dumper.dumpAll(() => {
        logger.log('Done');
        SleepSync.ms(2000);
    });
})();