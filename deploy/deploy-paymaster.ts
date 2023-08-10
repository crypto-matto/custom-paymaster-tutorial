import { utils, Provider, Wallet } from "zksync-web3";
import * as ethers from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";
import { setEnvValue } from "./utils";

import dotenv from "dotenv";
dotenv.config();

const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY || "";

export default async function (hre: HardhatRuntimeEnvironment) {
  const provider = new Provider(hre.userConfig.networks?.zkSyncLocalTestnet?.url);

  if (!WALLET_PRIVATE_KEY) {
    throw new Error("Please put WALLET_PRIVATE_KEY in .env to specify the private key of the wallet that will deploy the contracts");
  }

  // The wallet that will deploy the token and the paymaster
  // It is assumed that this wallet already has sufficient funds on zkSync
  const wallet = new Wallet(WALLET_PRIVATE_KEY);
  console.log(`Imported wallet's address: ${wallet.address}`);
  let balance = await provider.getBalance(wallet.address)
  console.log("Imported wallet's balance on l2: ", ethers.utils.formatEther(balance), "ETH");

  // The wallet that will receive ERC20 tokens
  const emptyWallet = Wallet.createRandom();
  console.log(`Empty wallet's address: ${emptyWallet.address}`);
  console.log(`Empty wallet's private key: ${emptyWallet.privateKey}`);

  const deployer = new Deployer(hre, wallet);

  // Deploying the ERC20 token
  const erc20Artifact = await deployer.loadArtifact("MyERC20");
  const erc20 = await deployer.deploy(erc20Artifact, [
    "MyToken",
    "MyToken",
    18,
  ]);
  console.log(`ERC20 address: ${erc20.address}`);

  // Deploying the paymaster
  const paymasterArtifact = await deployer.loadArtifact("MyPaymaster");
  const paymaster = await deployer.deploy(paymasterArtifact, [erc20.address]);
  console.log(`Paymaster address: ${paymaster.address}`);

  console.log(`Update .env file`);
  setEnvValue("EMPTY_WALLET_PRIVATE_KEY", emptyWallet.privateKey);
  setEnvValue("PAYMASTER_ADDRESS", paymaster.address);
  setEnvValue("TOKEN_ADDRESS", erc20.address);

  console.log("Funding paymaster with ETH");
  // Supplying paymaster with ETH
  await (
    await deployer.zkWallet.sendTransaction({
      to: paymaster.address,
      value: ethers.utils.parseEther("0.06"),
    })
  ).wait();

  let paymasterBalance = await provider.getBalance(paymaster.address);

  console.log(`Paymaster ETH balance is now ${ethers.utils.formatEther(paymasterBalance.toString())} ETH`);

  // Supplying the ERC20 tokens to the empty wallet:
  await // We will give the empty wallet 3 units of the token:
  (await erc20.mint(emptyWallet.address, 3)).wait();

  console.log("Minted 3 tokens for the empty wallet");

  // Checking the MyToken balance of the empty wallet:
  console.log("Empty wallet's MyToken balance:", ethers.BigNumber.from(await erc20.balanceOf(emptyWallet.address)).toNumber(), "MyToken");

  console.log(`Done!`);
}
