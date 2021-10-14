import {Position} from "./Entities";
import LoadConfig from "./Services/Utils/LoadConfig";
import Logger from "./Services/Utils/Logger";
import SleepSync from "./Services/Utils/SleepSync";

new LoadConfig();

const logger = new Logger('SyncModelsDB', false);

(async () => {
    process.title = `Sync Models DB`;

    Position.sync({alter: true})
        .then(value => {
            logger.log('Done');
            SleepSync.ms(2000);
        })
        .catch(reason => {
            logger.error(reason);
            logger.log('Done');
            SleepSync.ms(2000);
        });
})();
