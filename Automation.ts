import {chromium, Page} from "playwright-core";
import Backend, {LotteryDocument} from "./Backend";
import {CaptchaRun, solveCaptchaFromCache} from "./CaptchaRun";
import {sendLotteryAcceptedWebhook, sendLotteryErrorWebhook} from "./Webhook";

export const getCurrentNavigation = async(page: Page) => {
    let content = await page.locator("#curr").innerText();
    content = content?.trim();
    content = content?.replace("\n", "");
    content = content?.replace("\t", "");
    return content;
}

export const assertCurrentNavigation = async(page: Page, expect: string) => {
    if (await getCurrentNavigation(page) === expect){
        return true
    }
    throw new LotteryError(`Failed to reach ${expect}`)
}

export function randomChoice<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
}

export const getCurrentHeading = async(page: Page) => {
    let content = await page.locator("#wrap > form > section:nth-child(1) > div > div.contents_title.red_lightpink_back > h2").innerText();
    content = content?.trim();
    content = content?.replace("\n", "");
    content = content?.replace("\t", "");
    return content;
}

export const assertCurrentHeading = async(page: Page, expect: string) => {
    if (await getCurrentHeading(page) === expect){
        return true
    }
    throw new LotteryError(`Failed to reach ${expect}`)
}

export const checkElementExistence = async(page:Page, selector:string) => {
    const element = await page.$(selector);
    return element !== null;
}

export const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

function generateNormalRandom(mean: number, stdDev: number): number {
    let u1 = 0,
        u2 = 0;
    //Convert [0,1) to (0,1)
    while (u1 === 0) u1 = Math.random();
    while (u2 === 0) u2 = Math.random();

    const R = Math.sqrt(-2.0 * Math.log(u1));
    const theta = 2.0 * Math.PI * u2;
    const Z = R * Math.cos(theta); // Normally distributed random variable with mean 0 and stdDev 1

    return Z * stdDev + mean; // Scale and shift to mean
}

export function randomInRange(inputNumber: number): number {
    const min = inputNumber / 2;
    const max = inputNumber * 2;
    const mean = (min + max) / 2;
    const stdDev = (max - mean) / 3; // Assuming 99.7% should fall within [min, max] (3 standard deviations)

    let randomNum: number;
    do {
        randomNum = generateNormalRandom(mean, stdDev);
    } while (randomNum < min || randomNum > max); // Resample if outside range

    return randomNum;
}

export function delayWithNormalDistribution(inputNumber: number): Promise<void> {
    return new Promise(resolve => {
        const delay = randomInRange(inputNumber);
        setTimeout(resolve, delay);
    });
}

export const splitDate = (dateString: string): { year: string; month: string; day: string } =>{
    const parts = dateString.split('-');
    if (parts.length !== 3) {
        throw new Error("Invalid date format. Please use 'YYYY-MM-DD'.");
    }
    const [year, month, day] = parts;
    return { year, month, day };
}

//FOR SAFETY REASON
export const selectShow = async(page: Page, showNoOneBased: number) => {
    await page.evaluate((showNo) => {
        const zeroBased = showNo - 1;
        const elements = document.getElementsByName("hope_event_perf_cd")
        if (zeroBased < elements.length){
            elements[zeroBased].click()
        }
    }, showNoOneBased)
}
//FOR SAFETY REASON
export const selectSSSeat = async(page: Page) => {
    await page.evaluate(() => {
        const elements = document.getElementsByName("hope_stk_stknd_cd")
        elements[0].click()
    })
}

export const parsePhoneNumber = (phone: string): { first_three, middle_four, last_four } => {
    //slice start from the back
    const last_four = phone.slice(-4);
    const middle_four = phone.slice(-8, -4);
    const first_three = phone.slice(0, -8);
    return { first_three, middle_four, last_four };
}

export const parsePhoneFull = (phone: string) => {
    //only return last 11 digit
    return phone.slice(-11);
}

export const splitZipcode = (zipcode: string): { first: string; last: string } => {
    //100-0001
    const parts = zipcode.split('-');
    if (parts.length !== 2) {
        throw new Error("Invalid zipcode format. Please use 'XXX-XXXX'.");
    }
    const [first, last] = parts;
    return { first, last };
}

export const retry = async<T> (task: () => Promise<T>, attempts: number = 3): Promise<T> => {
    let lastError: any;

    for (let i = 0; i < attempts; i++) {
        try {
            // Attempt to execute the provided async task
            return await task();
        } catch (error) {
            // Keep track of the last error encountered
            lastError = error;
            // Log the retry attempt (optional)
            console.error(`Attempt ${i + 1} failed: ${error.message}. Retrying...`);
        }
    }

    // If no successful attempt, throw the last error encountered
    throw lastError;
}

/**
 * @param page
 */
export const getLotterySummery = async (page: Page) => {
    return await page.evaluate(() => {
        function extractDataIgnoringSpans() {
            const dls1 = document.querySelectorAll('.vertical_table.white_back.line_bottom');
            const dls2 = document.querySelectorAll('.vertical_table.white_back.line_top');
            const dls = Array.from(dls1).concat(Array.from(dls2));
            let resultText = '';

            dls.forEach(dl => {
                let title = '';
                let content = [];

                // Extract title, ignoring any <span> elements
                const dt = dl.querySelector('dt');
                if (dt) {
                    title = getTextContentIgnoringSpans(dt);
                }

                // Extract content for each <dd>, ignoring any <span> elements
                const dds = dl.querySelectorAll('dd');
                dds.forEach(dd => {
                    const ddText = getTextContentIgnoringSpans(dd);
                    if (ddText) content.push(ddText);
                });

                // Format the output
                if (title && content.length) {
                    resultText += `${title}: ${content.join(', ')}\n`;
                }
            });

            return resultText;
        }

        function getTextContentIgnoringSpans(element) {
            let text = '';
            // Walk through all child nodes of the element
            element.childNodes.forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    // Direct text nodes are added
                    text += node.textContent.trim();
                } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName !== 'SPAN') {
                    // Recursively fetch text for non-span elements
                    text += getTextContentIgnoringSpans(node);
                }
            });
            return text;
        }

        return extractDataIgnoringSpans();
    })
}

export const getCaptchaBase64 = async(page: Page) => {
    return await page.evaluate(() => {
        const img = document.getElementById('capchaImg');
        const canvas = document.createElement('canvas');
        canvas.width = img.clientWidth;
        canvas.height = img.clientHeight;
        const ctx = canvas.getContext('2d');
        // @ts-ignore
        ctx.drawImage(img, 0, 0);
        let dataURL = canvas.toDataURL('image/jpeg'); // Use 'image/png' if the image is a PNG
        dataURL = dataURL.replace(/^data:image\/(png|jpeg);base64,/, '');
        return dataURL;
    });
}

export const getCaptchaURL = async(page: Page) => {
    return await page.evaluate(() => {
        const img = document.getElementById('capchaImg');
        // @ts-ignore
        return img.src;
    });
}

export class LotteryError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "LotteryError";

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, LotteryError);
        }
    }
}

export class CaptchaError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CaptchaError";
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, LotteryError);
        }
    }
}


export const throwLotteryError = async (message: string) => {
    await delay(5000)
    throw new LotteryError(message)
}

export const throwCaptchaError = async (message: string) => {
    await delay(5000)
    throw new CaptchaError(message)
}

export const solveCaptchaAndSubmit = async (page: Page) => {
    let captcha_passed = false

    let captcha_solve_tries = 0
    let captcha_submit_tries = 0
    let cache = true
    let cache_url = ""

    let lottery_summary = ""

    for(let i = 0; i < 2; i++){
        lottery_summary = await getLotterySummery(page)

        try {
            await retry(async () => {
                let captcha_result = ""
                for(let i = 0; i < 10; i++){
                    await delay(1000)
                    captcha_solve_tries += 1
                    const captcha_data = await getCaptchaBase64(page)
                    const captcha_url = await getCaptchaURL(page)

                    captcha_result = solveCaptchaFromCache(captcha_url)
                    cache_url = captcha_url
                    cache = true

                    if (captcha_result === null) {
                        captcha_result = await CaptchaRun.solveTextCaptcha(captcha_data)
                        cache = false
                    }else{
                        console.log("Captcha cache hit, answer = " + captcha_result)
                    }

                    const refresh = async() => {
                        await page.click("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl.vertical_table.white_back > dd > p > a")
                        await delay(6688)
                    }

                    //check if captcha is six digit
                    if (captcha_result.length !== 6) {
                        console.error("captcha result " + captcha_result + " is not 6 digit")
                        //need refresh
                        await refresh()
                        continue
                    }

                    //check every digit is number
                    if (!captcha_result.match(/^\d+$/)) {
                        console.error("captcha result " + captcha_result + " is not number")
                        //need refresh
                        await refresh()
                        continue
                    }

                    if(captcha_result.indexOf("7") != -1 && Math.random() > 0.55){
                        console.error("captcha result contains 7, retry")
                        //need refresh
                        await refresh()
                        continue
                    }

                    captcha_submit_tries += 1
                    //console.log("captcha result", captcha_result)
                    break;
                }
                await page.fill("#captcha", captcha_result)
            }, 5)
        }catch (e){
            await throwLotteryError("Failed in captcha solving " + e.message)
        }

        await page.click("#upppd")
        await page.click("#speed_regist_enabled")

        await delayWithNormalDistribution(randomChoice([2000, 10000]))
        //check error
        if(await checkElementExistence(page,"#wrap > section:nth-child(6) > section > div > p > span > b")){
            //error
            let error_message = await page.locator("#wrap > section:nth-child(6) > section > div > p > span > b").innerText()
            if (error_message !== null && error_message !== ""){
                error_message = error_message.trim()
                if (error_message === "画像認証を正しく入力してください。" || "Please re-enter Authentication Characters correctry."){
                    console.log("Incorrect Captcha!")
                    if(cache){
                        await sendLotteryErrorWebhook("URGENT: Error in local captcha cache\nURL: " + cache_url)
                    }
                    await delay(5000)
                    continue;
                }else{
                    await throwLotteryError("Failed to submit lottery" + error_message)
                }
            }
        }
        captcha_passed = true
        break;
    }
    return {
        captcha_passed: captcha_passed,
        lottery_summary: lottery_summary,
        captcha_solve_tries: captcha_solve_tries,
        captcha_submit_tries: captcha_submit_tries
    }
}
export const completeOverseaLottery = async(
    page: Page,
    lottery: LotteryDocument,
    link: string
) => {
    await page.goto(link);
    await page.click("#wrap > form > section > div > input")
    await page.click("#upppd")
    await page.click("#speed_regist_enabled")

    await assertCurrentNavigation(page, "Application Input")
    await assertCurrentHeading(page, "Entry of your information input")

    await page.fill("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(2) > dd > p > input[type=text]:nth-child(1)", lottery.firstName.trim())
    await page.fill("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(2) > dd > p > input[type=text]:nth-child(2)", lottery.lastName.trim())
    if(lottery.male){
        await page.check("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(3) > dd > p > input[type=radio]:nth-child(2)")
    }else{
        await page.check("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(3) > dd > p > input[type=radio]:nth-child(1)")
    }
    await delayWithNormalDistribution(1000)

    const {year, month, day} = splitDate(lottery.birth)
    await page.selectOption("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(4) > dd > p > select:nth-child(1)", { value: year });
    await page.selectOption("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(4) > dd > p > select:nth-child(2)", { value: month });
    await page.selectOption("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(4) > dd > p > select:nth-child(3)", { value: day });

    const {first_three, middle_four, last_four} = parsePhoneNumber(lottery.phone)
    await page.fill("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(5) > dd:nth-child(4) > p > input[type=text]:nth-child(1)", first_three)
    await page.fill("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(5) > dd:nth-child(4) > p > input[type=text]:nth-child(2)", middle_four)
    await page.fill("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(5) > dd:nth-child(4) > p > input[type=text]:nth-child(3)", last_four)

    await delayWithNormalDistribution(1000)

    await page.fill("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(6) > dd:nth-child(2) > p:nth-child(3) > input[type=text]", lottery.email.trim())
    await page.fill("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(6) > dd:nth-child(3) > p:nth-child(2) > input[type=text]", lottery.email.trim())

    await delayWithNormalDistribution(1000)

    //nationality
    await page.selectOption("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(7) > dd > select", { label: lottery.nationality});

    //password
    await page.fill("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(8) > dd > p:nth-child(2) > input[type=text]", lottery.password.trim())

    //peer name
    const peerNameSplit = lottery.peerName.split(" ")
    const peerFirstName = peerNameSplit[0].trim()
    const peerLastName = peerNameSplit[1].trim()
    await page.fill("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(9) > dd > p:nth-child(2) > input[type=text]:nth-child(1)", peerFirstName)
    await page.fill("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(9) > dd > p:nth-child(2) > input[type=text]:nth-child(2)", peerLastName)
    //peer phone
    const peerPhoneFull = parsePhoneFull(lottery.peerPhone)
    await page.fill("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(9) > dd > p:nth-child(4) > input[type=text]", peerPhoneFull)

    await delayWithNormalDistribution(randomChoice([2000, 10000]))
    await page.click("#wrap > form > section:nth-child(2) > div:nth-child(2) > input.next")

    //SHOW
    await delayWithNormalDistribution(10000)
    await assertCurrentHeading(page, "Priority 1")
    await selectShow(page, lottery.showNo)//ONE BASED!!
    await page.click("#wrap > form > section:nth-child(2) > div:nth-child(2) > input.next")

    //SEAT
    await delayWithNormalDistribution(2000)
    await selectSSSeat(page)
    await page.click("#wrap > form > section:nth-child(2) > div:nth-child(2) > input.next")

    //COUNT
    await delayWithNormalDistribution(2000)
    await page.selectOption("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl > dd:nth-child(3) > p > select", { value: '2'});
    await page.click("#wrap > form > section:nth-child(2) > div:nth-child(2) > input.next")

    //CONFIRM
    await delayWithNormalDistribution(2000)
    await page.click("#wrap > form > section:nth-child(3) > div:nth-child(2) > input.next")

    //payment
    await delayWithNormalDistribution(2000)
    await delayWithNormalDistribution(randomChoice([2000, 5000]))
    await page.fill("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl.vertical_table.white_back > dd:nth-child(3) > dl > dd:nth-child(4) > div > dl:nth-child(1) > dd > p:nth-child(1) > input[type=TEXT]", lottery.creditCardNo.trim())
    await page.selectOption("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl.vertical_table.white_back > dd:nth-child(3) > dl > dd:nth-child(4) > div > dl:nth-child(2) > dd > p:nth-child(2) > select", { value: lottery.creditCardMonth.trim()})

    const ccYearSelector = "#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl.vertical_table.white_back > dd:nth-child(3) > dl > dd:nth-child(4) > div > dl:nth-child(2) > dd > p:nth-child(2) > input[type=TEXT]"

    //clear the input
    await page.fill(ccYearSelector, "")
    await page.fill(ccYearSelector, lottery.creditCardYear)

    await page.fill("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl.vertical_table.white_back > dd:nth-child(3) > dl > dd:nth-child(4) > div > dl:nth-child(4) > dd > p:nth-child(2) > input[type=password]", lottery.creditCardCVV.trim())
    await delayWithNormalDistribution(randomChoice([2000, 8000]))
    await page.click("#wrap > form > section:nth-child(2) > div:nth-child(2) > input.next")

    let found = false
    for(let i = 0; i < 100; i++){
        if(await getCurrentHeading(page) == "Ticket Issuance select"){
            found = true
            break
        }
        await delay(600)
    }
    if(!found){
        await throwLotteryError("Unable to submit credit card")
    }
    await page.click("#wrap > form > section:nth-child(2) > div:nth-child(2) > input.next")
    await delayWithNormalDistribution(randomChoice([2000, 10000]))

    let {captcha_passed, lottery_summary, captcha_solve_tries, captcha_submit_tries} = await solveCaptchaAndSubmit(page)
    if (!captcha_passed){
        await throwCaptchaError("Failed to solve captcha")
    }

    await delay(5000)
    const currentNavigation = await getCurrentNavigation(page)
    if(currentNavigation !== "Completion of Application"){
        await throwLotteryError("Unable to submit application, check credit card information")
    }

    const acpt_no = await page.locator("#wrap > section:nth-child(5) > div > div.contents_body.lightpink_back > dl:nth-child(1) > dt > b > span:nth-child(2) > font").innerText()
    let captcha_status = captcha_solve_tries + "," + captcha_submit_tries
    lottery_summary = "Oversea Accepted: " + acpt_no + "\nCaptchaRun: " + captcha_status + "" + "\n" + lottery_summary
    console.log("Lottery Submitted: ", acpt_no)
    return {
        acpt_no: acpt_no,
        summary: lottery_summary
    }
}

export const completeInlandLottery = async(
    page: Page,
    lottery: LotteryDocument,
    link: string
) => {
    await page.goto(link);
    await page.click("#wrap > section:nth-child(7) > div > div.contents_body.lightblue_back > dl:nth-child(2) > dd > p > input")
    await page.click("#wrap > form > section > div > input")

    //#注意事项
    await page.click("#upppd")
    await page.click("#speed_regist_enabled")

    //#申込入力
    await assertCurrentNavigation(page, "申込入力")
    await assertCurrentHeading(page, "お客様情報入力")
    await page.fill("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(3) > dd:nth-child(2) > input[type=text]:nth-child(3)", lottery.lastName.trim())
    await page.fill("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(3) > dd:nth-child(2) > input[type=text]:nth-child(4)", lottery.firstName.trim())
    await page.fill("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(3) > dd:nth-child(3) > input[type=text]:nth-child(3)", lottery.lastNameKatakana.trim())
    await page.fill("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(3) > dd:nth-child(3) > input[type=text]:nth-child(4)", lottery.firstNameKatakana.trim())
    if (lottery.male){
        await page.check("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(4) > dd > p > input[type=radio]:nth-child(2)")
    }else{
        await page.check("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(4) > dd > p > input[type=radio]:nth-child(1)")
    }
    await delayWithNormalDistribution(1000)

    const {year, month, day} = splitDate(lottery.birth)
    await page.selectOption("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(5) > dd > p > select:nth-child(1)", year)
    await page.selectOption("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(5) > dd > p > select:nth-child(2)", month)
    await page.selectOption("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(5) > dd > p > select:nth-child(3)", day)

    const {first_three, middle_four, last_four} = parsePhoneNumber(lottery.phone)
    await page.fill("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(6) > dd > p:nth-child(3) > input[type=text]:nth-child(1)", first_three)
    await page.fill("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(6) > dd > p:nth-child(3) > input[type=text]:nth-child(2)", middle_four)
    await page.fill("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(6) > dd > p:nth-child(3) > input[type=text]:nth-child(3)", last_four)
    await delayWithNormalDistribution(1000)

    //email
    await page.fill("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(7) > dd:nth-child(2) > p:nth-child(3) > input[type=text]", lottery.email.trim())
    await page.fill("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(7) > dd:nth-child(3) > p:nth-child(2) > input[type=text]", lottery.email.trim())
    await delayWithNormalDistribution(1000)

    //address
    const {first, last} = splitZipcode(lottery.postalCode)
    await page.fill("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(8) > dd > p:nth-child(2) > input[type=text]:nth-child(1)", first)
    await page.fill("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(8) > dd > p:nth-child(2) > input[type=text]:nth-child(2)", last)
    await page.click("#zip_search")

    let address_found = false;
    const address_1_selector = "#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(9) > dd:nth-child(3) > p:nth-child(2) > input[type=text]"
    const address_2_selector = "#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(9) > dd:nth-child(4) > p:nth-child(2) > input[type=text]"
    const address_3_selector = "#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(9) > dd:nth-child(5) > p:nth-child(2) > input[type=text]"

    //wait for address-1 to be filled or error raised.
    for (let i = 0; i < 250; i++) {
        if (i != 0 && i % 25 == 0){
            await page.click("#zip_search")
        }
        const zip_error_selector = "#postNoErrorM"
        if (await checkElementExistence(page, zip_error_selector)) {
            const text_content = await page.locator(zip_error_selector).innerText()
            if (text_content !== null && text_content !== "") {
                //input incorrect
                await throwLotteryError("Failed to find address [1]")
            }
        }
        const address_1_val = await page.locator(address_1_selector).inputValue()
        if (address_1_val !== "") {
            address_found = true;
            break;
        }
        await delay(1000);
    }

    //network
    if (!address_found) {
        throw Error("Failed to find address [2] due to network issue")
    }

    await delayWithNormalDistribution(2000)
    //fill address-2 if it is empty
    const address_2_content = await page.locator(address_2_selector).inputValue()
    if (address_2_content === null || address_2_content === "") {
        console.log("address 2 is empty")
        await page.fill(address_2_selector, await page.locator(address_1_selector).inputValue())
    }
    //fill address-3 if it is empty
    const address_3_content = await page.locator(address_3_selector).inputValue()
    if (address_3_content === null || address_3_content === "") {
        await page.fill(address_3_selector, "番地なし")
    }

    //password
    await page.fill("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(11) > dd > p:nth-child(2) > input[type=text]", lottery.password)

    //peer
    await page.fill("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(12) > dd:nth-child(3) > p:nth-child(1) > input[type=text]", lottery.peerName)
    await page.fill("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(12) > dd:nth-child(3) > p:nth-child(2) > input[type=text]", parsePhoneFull(lottery.peerPhone))

    //delay before submit
    await delayWithNormalDistribution(randomChoice([2000, 10000]))
    await page.click("#wrap > form > section:nth-child(2) > div:nth-child(2) > input.next")
    await delayWithNormalDistribution(2000)

    const page_1_error_selector = "#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl:nth-child(2) > p > span > b"
    if (await checkElementExistence(page, page_1_error_selector)) {
        const text_content = await page.locator(page_1_error_selector).innerText()
        if (text_content !== null && text_content !== "") {
            await throwLotteryError("Failed to submit page 1" + text_content)
        }
    }

    //SHOW
    await delayWithNormalDistribution(2000)
    await assertCurrentHeading(page, "第1希望")
    await selectShow(page, lottery.showNo)//ONE BASED!!
    await page.click("#wrap > form > section:nth-child(2) > div:nth-child(2) > input.next")

    //SEAT
    await delayWithNormalDistribution(2000)
    await selectSSSeat(page)
    await page.click("#wrap > form > section:nth-child(2) > div:nth-child(2) > input.next")

    //COUNT
    await delayWithNormalDistribution(2000)
    await page.selectOption("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl > dd:nth-child(3) > p > select", { value: '2'});
    await page.click("#wrap > form > section:nth-child(2) > div:nth-child(2) > input.next")

    //CONFIRM
    await delayWithNormalDistribution(2000)
    await page.click("#wrap > form > section:nth-child(3) > div:nth-child(2) > input.next")

    //payment
    await delayWithNormalDistribution(2000)
    await assertCurrentHeading(page, "決済方法選択")
    await page.click("#wrap > form > section:nth-child(1) > div > div.contents_body.lightpink_back > dl.vertical_table.white_back > dd:nth-child(3) > dl > dt > input[type=radio]")//711
    await page.click("#wrap > form > section:nth-child(2) > div:nth-child(2) > input.next")

    //引取方法確認
    await delayWithNormalDistribution(2000)
    await assertCurrentHeading(page, "引取方法確認")
    await page.fill("#pocket_auth > dl:nth-child(1) > dd > p > input[type=text]", lottery.piaAccount.trim())
    await page.fill("#pocket_auth > dl:nth-child(2) > dd > p > input[type=password]", lottery.piaPassword.trim())
    await page.click("#wrap > form > section:nth-child(2) > div:nth-child(2) > input.next")

    //check account error
    await delayWithNormalDistribution(2000)
    const account_error_selector = "#pocket_auth > dl:nth-child(1) > dt:nth-child(1) > b > span"
    if (await checkElementExistence(page, account_error_selector)) {
        const text_content = await page.locator(account_error_selector).innerText()
        if (text_content !== null && text_content !== "") {
            await throwLotteryError("Failed to submit account" + text_content)
        }
    }

    //#confirm
    await delayWithNormalDistribution(2000)
    await assertCurrentNavigation(page, "内容確認")


    let {captcha_passed, lottery_summary, captcha_solve_tries, captcha_submit_tries} = await solveCaptchaAndSubmit(page)
    if (!captcha_passed){
        await throwCaptchaError("Failed to solve captcha")
    }

    await delayWithNormalDistribution(2000)
    await assertCurrentNavigation(page, "申込完了")
    //get acpt_no
    const acpt_no = await page.locator("#wrap > section:nth-child(6) > div > dl:nth-child(2) > dt > b > span").innerText()
    console.log("Lottery Submitted: ", acpt_no)

    let captcha_status = captcha_solve_tries + "," + captcha_submit_tries
    lottery_summary = "Inland Accepted: " + acpt_no + "\nCaptchaRun: " + captcha_status + "" + "\n" + lottery_summary

    return {
        acpt_no: acpt_no,
        summary: lottery_summary
    }
}
