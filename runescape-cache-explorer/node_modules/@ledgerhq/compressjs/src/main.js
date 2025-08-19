const freeze = require('./lib/freeze');
const BitStream = require('./lib/BitStream');
const Stream = require('./lib/Stream');
const BWT = require('./lib/BWT');
const Context1Model = require('./lib/Context1Model');
const DefSumModel = require('./lib/DefSumModel');
const FenwickModel = require('./lib/FenwickModel');
const MTFModel = require('./lib/MTFModel');
const NoModel = require('./lib/NoModel');
const Huffman = require('./lib/Huffman');
const RangeCoder = require('./lib/RangeCoder');
const BWTC = require('./lib/BWTC');
const Bzip2 = require('./lib/Bzip2');
const Dmc = require('./lib/Dmc');
const Lzjb = require('./lib/Lzjb');
const LzjbR = require('./lib/LzjbR');
const Lzp3 = require('./lib/Lzp3');
const PPM = require('./lib/PPM');
const Simple = require('./lib/Simple');

module.exports = freeze({
    version: "1.2.0",
    // APIs
    BitStream: BitStream,
    Stream: Stream,
    // transforms
    BWT: BWT,
    // models and coder
    Context1Model: Context1Model,
    DefSumModel: DefSumModel,
    FenwickModel: FenwickModel,
    MTFModel: MTFModel,
    NoModel: NoModel,
    Huffman: Huffman,
    RangeCoder: RangeCoder,
    // compression methods
    BWTC: BWTC,
    Bzip2: Bzip2,
    Dmc: Dmc,
    Lzjb: Lzjb,
    LzjbR: LzjbR,
    Lzp3: Lzp3,
    PPM: PPM,
    Simple: Simple
});
