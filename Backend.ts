import mongoose, {Model, Schema, Types} from 'mongoose';

// db.lotteries.find({}, { status: 1, acptNo: 1, showNo: 1, email: 1, _id: 1, lastErrorMessage: 1 })

enum LotteryStatus {
    CREATED = 'CREATED',
    WORKING = 'WORKING',
    COMPLETED = 'COMPLETED',
    ERROR = 'ERROR',
}

enum LotteryResult {
    PENDING = 'PENDING',
    WIN = 'WIN',
    LOSE = 'LOSE',
    UNKNOWN = 'UNKNOWN',
}

interface ILottery {
    bundle: string;
    round: string;
    status: LotteryStatus;
    result: LotteryResult;
    showNo: number;
    acptNo?: string; // optional field
    password: string;

    creationDate: Date;
    completeDate?: Date; // optional field

    email: string;
    phone: string;
    male: boolean;
    birth: string;

    firstName: string;
    firstNameKatakana?: string; // optional field
    lastName: string;
    lastNameKatakana?: string; // optional field

    peerName: string;
    peerPhone: string;

    postalCode?: string; // optional field
    piaAccount?: string; // optional field
    piaPassword?: string; // optional field

    nationality?: string; // optional field
    creditCardNo?: string; // optional field
    creditCardMonth?: string; // optional field
    creditCardYear?: string; // optional field
    creditCardCVV?: string; // optional field
}

interface LotteryDocument extends Document, ILottery {
    _id: Types.ObjectId;
}



const LotterySchema = new mongoose.Schema({
    bundle: { type: String, index: true, required: true }, //magicalmirai2024
    round: { type: String, index: true, required: true },  //inland-1
    status: { type: String, enum: Object.values(LotteryStatus), index: true, default: LotteryStatus.CREATED },
    result: { type: String, enum: Object.values(LotteryResult), index: true, default: LotteryResult.PENDING },
    showNo: { type: Number, required: true, index: true}, //1 => first show  [1 based index!!]
    acptNo: { type: String, default: null, index: true }, //acpt number
    password: { type: String, required: true},            //password

    creationDate: { type: Date, default: Date.now }, 
    completeDate: { type: Date, default: null },
    lastErrorMessage: { type: String, default: null },
    /*
     core info
     */
    email: { type: String, index: true, required: true },
    phone: { type: String, required: true },//08012345678 or 182110331391
    male: { type: Boolean, required: true },
    birth: { type: String, required: true },//YYYY-MM-DD (2020-11-12)
    /*
    name, oversea does not need Katakana
     */
    firstName: { type: String, required: true },
    firstNameKatakana: { type: String, default: null},
    lastName: { type: String, required: true },
    lastNameKatakana: { type: String, default: null},
    /*
    peer
     */
    peerName: { type: String, required: true },
    peerPhone: { type: String, required: true },
    /*
    inland
     */
    postalCode: { type: String, default: null}, //100-0001
    piaAccount: { type: String, default: null},
    piaPassword: { type: String, default: null},
    /*
    oversea
     */
    nationality: { type: String, default: null},  //United States
    creditCardNo: { type: String, default: null}, //0-pad if needed
    creditCardMonth: { type: String, default: null}, //04
    creditCardYear: { type: String, default: null}, //2024
    creditCardCVV: { type: String, default: null},
});

const Lottery = mongoose.model<LotteryDocument>('Lottery', LotterySchema);

export {Lottery, LotteryStatus, LotteryResult, ILottery, LotteryDocument}
