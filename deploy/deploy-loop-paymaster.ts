import { utils, Provider, Wallet } from "zksync-web3";
import * as ethers from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";
import * as fs from "fs";
import { setEnvValue } from "./utils";

import dotenv from "dotenv";
dotenv.config();

const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY || "";
const FUNDING_AMOUNT = "0.04";

export default async function (hre: HardhatRuntimeEnvironment) {
  const provider = new Provider(hre.userConfig.networks?.zkSyncLocalTestnet?.url);

  // The wallet that will deploy the token and the paymaster
  // It is assumed that this wallet already has sufficient funds on zkSync
  const wallet = new Wallet(WALLET_PRIVATE_KEY);

  // The wallet that will receive ERC20 tokens
  console.log(`Imported wallet's address: ${wallet.address}`);
  let balance = await provider.getBalance(wallet.address)
  console.log("Imported wallet's balance on l2: ", ethers.utils.formatEther(balance), "ETH");

  const emptyWallet = Wallet.createRandom();
  console.log(`Empty wallet's address: ${emptyWallet.address}`);
  console.log(`Empty wallet's private key: ${emptyWallet.privateKey}`);

  const deployer = new Deployer(hre, wallet);

  // Deploying Loop
  const loopArtifact = await deployer.loadArtifact("TestLoop");
  const loopContract = await deployer.deploy(loopArtifact, ["Before Loop", 1000]);
  console.log(`Loop contract address: ${loopContract.address}`);

  // Deploying the paymaster
  const paymasterArtifact = await deployer.loadArtifact("MyLoopPaymaster");
  const paymaster = await deployer.deploy(paymasterArtifact, []);
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
  setEnvValue("PAYMASTER_ADDRESS", paymaster.address);
  setEnvValue("LOOP_CONTRACT_ADDRESS", loopContract.address);

  console.log(`Done!`);
}
