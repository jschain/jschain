const express = require('express');
const bodyParser = require('body-parser');
const CryptoJS = require('crypto-js');
const PouchDB = require('pouchdb');

PouchDB.plugin(require('pouchdb-find'));

const http_port = process.env.HTTP_PORT || 3001;
const db = new PouchDB('./data/jschain', {adapter: 'leveldb'});

/**
 * Represents a block in a chain
 */
class Block {
    /**
     * Block constructor
     * @param index - block index
     * @param previousHash - hash of previous block (for genesis block equals zero)
     * @param timestamp - timestamp of creation
     * @param data - block data (transactions hash presumably)
     * @param hash - hash of this current block
     */
    constructor(index, previousHash, timestamp, data, hash) {
        this.index = index;
        this.previousHash = previousHash.toString();
        this.timestamp = timestamp;
        this.data = data;
        this.hash = hash.toString();
    }
}

/**
 * If newly created block is valid, add it to chain
 * @param {Block} newBlock
 */
function addBlock(newBlock) {
    if (isValidNewBlock(newBlock, getLatestBlock())) {
        blockchain.push(newBlock);
    }
}

/**
 * Calculating hash for block, on the basis of parameters
 * @param index - index of the new block
 * @param previousHash - index of the previous block(currently last block in chain
 * @param timestamp - timestamp of creation
 * @param data - block data (transactions hash presumably), now it is just some data
 */
function calculateHash(index, previousHash, timestamp, data) {
    return CryptoJS.SHA512(index + previousHash + timestamp + data).toString();
}

function calculateHashForBlock(block) {
    return calculateHash(block.index, block.previousHash, block.timestamp, block.data);
}

/**
 * Performs the process of block creation
 * @param blockData - data for the new block
 * @returns {Promise<Block>}
 */
function generateNextBlock(blockData) {
    return new Promise(function(resolve, reject){
        let previousBlock = getLatestBlock();
        let nextIndex = previousBlock.index + 1;
        let nextTimestamp = new Date().getTime() / 1000;
        let nextHash = calculateHash(nextIndex, previousBlock.hash, nextTimestamp, blockData);
        let newBlock = new Block(nextIndex, previousBlock.hash, nextTimestamp, blockData, nextHash);
        return resolve(newBlock);
    });
}

/**
 * Generates genesis block of JSChain
 * @returns {Block}
 */

function getGenesisBlock() {
    return new Block(0, "0", 1465154705, "JSChain genesis block", "816534932c2b7154836da6afc367695e6337db8a921823784c14378abed4f7d7");
}

/**
 * Checks if received chain is valid
 * @param blockchainToValidate - array of blocks
 * @returns {boolean}
 */
function isValidChain(blockchainToValidate) {
    if (JSON.stringify(blockchainToValidate[0]) !== JSON.stringify(getGenesisBlock())) {
        return false;
    }
    let tempBlocks = [blockchainToValidate[0]];
    for (let i = 1; i < blockchainToValidate.length; i++) {
        if (isValidNewBlock(blockchainToValidate[i], tempBlocks[i - 1])) {
            tempBlocks.push(blockchainToValidate[i]);
        } else {
            return false;
        }
    }
    return true;
}

/**
 * Checks if newly created block is valid
 * @param newBlock - block to check
 * @param previousBlock - latest block in the chain
 * @returns {boolean}
 */
function isValidNewBlock(newBlock, previousBlock) {
    if (previousBlock.index + 1 !== newBlock.index) {
        console.log('invalid index');
        return false;
    } else if (previousBlock.hash !== newBlock.previousHash) {
        console.log('invalid previoushash');
        return false;
    } else if (calculateHashForBlock(newBlock) !== newBlock.hash) {
        console.log(typeof (newBlock.hash) + ' ' + typeof calculateHashForBlock(newBlock));
        console.log('invalid hash: ' + calculateHashForBlock(newBlock) + ' ' + newBlock.hash);
        return false;
    }
    return true;
}

/**
 * If the received chain is valid, replace current
 * @param newBlocks - received chain
 */
function replaceChain(newBlocks) {
    if (isValidChain(newBlocks) && newBlocks.length > blockchain.length) {
        console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');
        blockchain = newBlocks;
    } else {
        console.log('Received blockchain invalid');
    }
}

/**
 * Returns latest block in current chain
 * @returns {Block}
 */
function getLatestBlock() {
    return blockchain[blockchain.length - 1];
}

/**
 * Makes preparations before starting the app
 * Checks if database is created and available
 * Checks if database is indexed
 * Reads blockchain from database
 */

function startup() {
    db.createIndex({
        fields:['index', 'data', 'timestamp', 'previousHash', 'hash'],
        name: 'block'
    }).then(function(result){
        if(result.result === 'created'){
            console.log('index created');
        }
        if(result.result === 'exists'){
            console.log('index exists');
        }
    }).catch(function (err) {
        console.log(err);
    });
    db.find({
        fields: ['index', 'data', 'timestamp', 'previousHash', 'hash'],
        selector: {index :{$gte : 0}}
    }).then(function(result){
        blockchain = result.docs;
        app.listen(http_port, () => {
            console.log('Listening http on port: ' + http_port)
    });
    }).catch(function (err) {
        console.log(err);
    });
}

/**
 * Writes new block to database
 * @param block - a block to write
 */

function insertBlock(block) {
    db.post(block)
        .then(function (response) {
            if (response.ok) {
                console.log('block added' + JSON.stringify(block));
            }
        }).catch(function (err) {
        console.log(err);
    });
}

let app = express();

app.use(bodyParser.json());
/**
 * Default route
 */
app.get('/', (req, res) => {
    res.send("Welcome to JSChain");
});
/**
 * Route for checking blockchain state
 * When the app is on, you can see all blocks on this route
 */
app.get('/blocks', (req, res) => {
    res.json(blockchain);
});
/**
 * Route for creating new block
 * Temporary solution before any mining algorithm is implemented
 */
app.post('/mineBlock', (req, res) => {
    let newBlock;
    generateNextBlock(req.body.data)
        .then(
            (result) => {
                newBlock = result;
                addBlock(newBlock);
                insertBlock(newBlock);
                console.log('block added: ' + JSON.stringify(newBlock));
                res.json(newBlock);
            }
        ).catch((err)=>{
        console.log(err.message);
    });
});
/**
 * Route for generating genesis block
 */
app.post('/generategenesis',(req, res) => {
    let genesisblock = getGenesisBlock();
    insertBlock((genesisblock));
    res.json(genesisblock);
});
/**
 * The blockchain itself
 */
var blockchain;
/**
 * Starts the app
 */
startup();
