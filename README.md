Not include:
- browser startup
- captcha solving (interface provided, need implementation)


Example usage:

```js
    const pool = new LotteryWorkerPool(
        "mm2024",
        "inland-2",
        "https://pia.jp/piajp/v/magicalmirai24-2/",
        g,
        5,
        completeInlandLottery,
        8000,
        20*1000*60,
    )
```

```js
/**
 * Lottery Framework
 */

export type Workspace = {
    page: Page,
    close: () => Promise<void>,
}
// Type definition for the factory method that will create a Page
export type BrowserFactory = () => Promise<Workspace>;

export class LotteryWorkerPool{
    private BrowserFactory: BrowserFactory;
    private bundle: string;
    private round: string;
    private URL: string;
    private numWorkers = 0;
    private executeLotteryTask: (
        page: Page,
        lottery: LotteryDocument,
        link: string) => Promise<{
        acpt_no: string,
        summary: string,
    }>;
    private pauseBetweenLottery: number;
    private pauseBetweenAccount: number;

    private lotteryTasksGroupByEmail: LotteryDocument[][];

    constructor(
        bundle: string,
        round: string,
        url: string,
        factory: BrowserFactory,
        numWorkers: number,
        executeLotteryTask: (
            page: Page,
            lottery: LotteryDocument,
            link: string) => Promise<{
            acpt_no: string,
            summary: string,
        }>,
        pauseBetweenLottery = 5000,
        pauseBetweenAccount: number = 50000,
    ) {
        this.bundle = bundle;
        this.round = round;
        this.URL = url;
        this.BrowserFactory = factory;
        this.numWorkers = numWorkers;
        this.executeLotteryTask = executeLotteryTask;
        this.pauseBetweenLottery = pauseBetweenLottery;
        this.pauseBetweenAccount = pauseBetweenAccount;
    }

    private async runWorker(workerId: number){
        let workspace = null;

        const log = (msg: string) => {
            console.log("Worker ", workerId, msg);
        }

        const deallocateWorkspace = async () => {
            try{
                if (workspace){
                    await workspace.close();
                }
            }catch(_){

            }finally {
                workspace = null;
            }
        }

        const allocateWorkspace = async () => {
            if(!workspace){
                while(true){
                    try{
                        workspace = await this.BrowserFactory();
                        break;
                    }catch(e){
                        log("Failed to close workspace: " + e.message);
                        await sendLotteryErrorWebhook("Unable to allocate workspace: " + e.message);
                        await delayWithNormalDistribution(100000);
                    }
                }
            }
        }

        const reallocateWorkspace = async () => {
            await deallocateWorkspace()
            await allocateWorkspace()
        }

        while(true){
            //get one group of tasks or exit
            const group = this.lotteryTasksGroupByEmail.shift();
            if (!group){
                log("No more tasks, exiting");
                await deallocateWorkspace();
                break;
            }

            await allocateWorkspace();
            log("Start processing " + group.length + " tasks");

            for (let i = 0; i < group.length; i++){
                const lottery = group[i];
                try {
                    //account for network error
                    for(let network_retry = 0; network_retry < 3; network_retry++) {
                        try {
                            const result = await this.executeLotteryTask(workspace.page, lottery, this.URL)
                            log("Lottery completed: " + result.acpt_no);
                            await Backend.lotteryComplete(lottery, result.acpt_no);
                            await sendLotteryAcceptedWebhook(result.summary);
                            break;
                        } catch (e) {
                            //if it's not a network error, throw to catch
                            if (e instanceof LotteryError) {
                                log("Failed to attempt lottery due to lottery error " + e.message);
                                throw e
                            }else{
                                //network error
                                log("Failed to attempt lottery due to network issues " + e.message);
                                console.log(e)
                                await reallocateWorkspace();
                                if (network_retry == 2){
                                    throw e;
                                }
                            }
                        }
                    }
                }catch (e) {
                    log("Failed to complete lottery: " + e.message);
                    //console.log(e)
                    if (e instanceof LotteryError) {
                        await sendLotteryErrorWebhook("LotteryError: " + e.message  + "\nEarly Stop: 1");
                        await Backend.lotteryError(lottery, e.message)
                        //early stop all other tasks, mark as error\
                        for(let j = i + 1; j < group.length; j++){
                            await Backend.lotteryError(group[j], e.message)
                        }
                        log("This is a lottery error, early stop all other tasks");
                        break;
                    }else{
                        //network error?
                        //already reallocate workspace above
                        await Backend.lotteryError(lottery, e.message)
                        await sendLotteryErrorWebhook("OtherError: " + e.message);
                    }
                }
                await delayWithNormalDistribution(this.pauseBetweenLottery);
            }

            log("Finish processing " + group.length + " tasks");
            await deallocateWorkspace();


            await delayWithNormalDistribution(this.pauseBetweenAccount);
        }
    }

    private async loadLotteryTasks(){
        const lotteries = await Backend.getUnfinishedLotteries(this.bundle, this.round, true)
        //group by email
        const acc = {}
        for (let i = 0; i < lotteries.length; i++){
            const lottery = lotteries[i];
            if (!acc[lottery.email]){
                acc[lottery.email] = [];
            }
            acc[lottery.email].push(lottery);
        }
        this.lotteryTasksGroupByEmail = Object.values(acc);
    }

    async run(){
        await this.loadLotteryTasks();

        console.log("There are ", this.lotteryTasksGroupByEmail.length, " groups of tasks")
        console.log("There are ", this.numWorkers, " workers")

        const workerPromises: Promise<void>[] = [];
        for(let i = 0; i < this.numWorkers; i++){
            const workerPromise = this.runWorker(i);
            workerPromises.push(workerPromise);
        }
        await Promise.all(workerPromises);
    }
}
```
