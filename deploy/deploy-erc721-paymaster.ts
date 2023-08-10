import { Provider, Wallet } from "zksync-web3";
import * as ethers from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";
import * as fs from "fs";
import * as readline from "readline";
import { setEnvValue } from "./utils";

// load env file
import dotenv from "dotenv";
dotenv.config();

const PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY || "";
const FUNDING_AMOUNT = "0.01";

if (!PRIVATE_KEY)
  throw "⛔️ Private key not detected! Add WALLET_PRIVATE_KEY to the .env file!";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function getRecipientAddress(): Promise<string> {
  return new Promise((resolve, reject) => {
    rl.question(
      "Please provide the recipient address to receive an NFT: ",
      (address) => {
        if (!address) {
          reject("⛔️ RECIPIENT_ADDRESS not provided!");
        } else {
          resolve(address);
        }
      },
    );
  });
}

export default async function (hre: HardhatRuntimeEnvironment) {
  console.log(`Running deploy script for the ERC721 & ERC721GatedPaymaster contract...`);

  // It is assumed that this wallet already has sufficient funds on zkSync
  const wallet = new Wallet(PRIVATE_KEY);
  const deployer = new Deployer(hre, wallet);
  const provider = new Provider(hre.userConfig.networks?.zkSyncLocalTestnet?.url);

  // The wallet that will receive ERC721 token
  const emptyWallet = Wallet.createRandom();
  console.log(`Empty wallet's address: ${emptyWallet.address}`);
  console.log(`Empty wallet's private key: ${emptyWallet.privateKey}`);

  // We will mint the NFTs to this address
  // const RECIPIENT_ADDRESS = await getRecipientAddress();
  const RECIPIENT_ADDRESS = emptyWallet.address;
  if (!RECIPIENT_ADDRESS) throw "⛔️ RECIPIENT_ADDRESS not detected!";

  // Deploying the ERC721 contract
  const nftContractArtifact = await deployer.loadArtifact("InfinityStones");
  const nftContract = await deployer.deploy(nftContractArtifact, []);
  console.log(`ERC721 Contract address: ${nftContract.address}`);

  const NFT_COLLECTION_ADDRESS = nftContract.address;

  // Mint NFTs to the recipient address
  const stone = "Power Stone";
  const tx = await nftContract.mint(RECIPIENT_ADDRESS, stone);
  await tx.wait();
  console.log(`The ${stone} has been given to ${RECIPIENT_ADDRESS}`);

  // Get and log the balance of the recipient
  const balance = await nftContract.balanceOf(RECIPIENT_ADDRESS);
  console.log(`Balance of recipient ${RECIPIENT_ADDRESS}: ${balance}`);

  // Update base URI
  let setBaseUriTransaction = await nftContract.setBaseURI(
    "https://ipfs.io/ipfs/QmPtDtJEJDzxthbKmdgvYcLa9oNUUUkh7vvz5imJFPQdKx",
  );
  await setBaseUriTransaction.wait();
  console.log(`New baseURI is ${await nftContract.baseURI()}`);

  // Update paymaster deploy script with contract address
  const paymasterDeploymentFilePath =
    __dirname + "/deploy-erc721-paymaster.ts";
  const res = fs.readFileSync(paymasterDeploymentFilePath, "utf8");
  const final = res.replace(/0xd00aA47887597f95a68f87f1a5C96Df1B3fF0bdF/g, nftContract.address);
  fs.writeFileSync(paymasterDeploymentFilePath, final, "utf8");

  // Deploying the paymaster
  const paymasterArtifact = await deployer.loadArtifact("ERC721GatedPaymaster");
  const deploymentFee = await deployer.estimateDeployFee(paymasterArtifact, [
    NFT_COLLECTION_ADDRESS,
  ]);
  const parsedFee = ethers.utils.formatEther(deploymentFee.toString());
  console.log(`The paymaster deployment is estimated to cost ${parsedFee} ETH`);

  // Deploy the contract
  const paymaster = await deployer.deploy(paymasterArtifact, [
    NFT_COLLECTION_ADDRESS,
  ]);
  console.log(`Paymaster address: ${paymaster.address}`);

  console.log("Funding paymaster with ETH");
  // Supplying paymaster with ETH
  await (
    await deployer.zkWallet.sendTransaction({
      to: paymaster.address,
      value: ethers.utils.parseEther(FUNDING_AMOUNT),
    })
  ).wait();

  let paymasterBalance = await provider.getBalance(paymaster.address);
  console.log(`Paymaster ETH balance is now ${ethers.utils.formatEther(paymasterBalance).toString()} ETH`);

  console.log(`Updating .env file`);
  setEnvValue("EMPTY_WALLET_PRIVATE_KEY", emptyWallet.privateKey);
  setEnvValue("ERC721_TOKEN_ADDRESS", nftContract.address);
  setEnvValue("PAYMASTER_ADDRESS", paymaster.address);

  console.log(`Done!`);
}