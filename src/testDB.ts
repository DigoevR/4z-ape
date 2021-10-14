import LoadConfig from "./Services/Utils/LoadConfig";
import Logger from "./Services/Utils/Logger";
import SleepSync from "./Services/Utils/SleepSync";
import {Position} from "./Entities";

new LoadConfig();

const logger = new Logger('TestDB', false);

(async () => {
    process.title = `Test DB`;

    const testPair = '0xTEST-PAIR-NEW';
    const testPairUpdated = '0xTEST-PAIR-UPDATED';
    const testToken0 = '0xTEST-TOKEN-0';
    const testToken1 = '0xTEST-TOKEN-1';
    const profitLossCheckedAtDate = new Date();
    const reserveEnter = '500';

    logger.log(`Creating new DB row (${testPair} pair)`);
    Position.build({
        pair: testPair,
        token0: testToken0,
        token1: testToken1,
        profitLossCheckedAt: profitLossCheckedAtDate,
        reserveEnter: reserveEnter,
    })
        .save()
        .then(value => {
            logger.log(`Successful`);

            logger.log(`Searching for DB row with ${testPair} pair`);
            Position.findOne({
                where: {
                    pair: testPair,
                }
            }).then(searchedPosition => {
                logger.log(`Successful`);

                logger.log(`Updating row's pair from ${testPair} to ${testPairUpdated}`);
                searchedPosition.update({
                    pair: testPairUpdated,
                }).then(updatedPosition => {
                    logger.log(`Successful`);

                    logger.log(`Searching for DB row with ${testPairUpdated} pair`);
                    Position.findOne({
                        where: {
                            pair: testPairUpdated,
                        }
                    }).then(searchedUpdatedPosition => {
                        logger.log(`Successful`);

                        logger.log(`Destroying DB row with ${testPairUpdated} pair`);
                        searchedUpdatedPosition.destroy()
                            .then(_ => {
                                logger.log(`Successful`);

                                logger.log('DB is fine');
                                logger.log('Done');
                                SleepSync.ms(2000);
                            })
                            .catch(reason => {
                                logger.error(reason);
                                logger.log('Done');
                                SleepSync.ms(2000);
                            })
                    }).catch(reason => {
                        logger.error(reason);
                        logger.log('Done');
                        SleepSync.ms(2000);
                    });
                }).catch(reason => {
                    logger.error(reason);
                    logger.log('Done');
                    SleepSync.ms(2000);
                });
            }).catch(reason => {
                logger.error(reason);
                logger.log('Done');
                SleepSync.ms(2000);
            });
        })
        .catch(reason => {
            logger.error(reason);
            logger.log('Done');
            SleepSync.ms(2000);
        });

})();