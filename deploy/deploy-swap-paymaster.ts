import { utils, Provider, Wallet } from "zksync-web3";
import * as ethers from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";
import * as fs from "fs";
import { setEnvValue } from "./utils";

import dotenv from "dotenv";
dotenv.config();

const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY || "";
const FUNDING_AMOUNT = "0.05";

async function deployUniSwapTokenContracts(hre: HardhatRuntimeEnvironment) {
  const wallet = new Wallet(WALLET_PRIVATE_KEY);
  const provider = new Provider(hre.userConfig.networks?.zkSyncLocalTestnet?.url);
  const deployer = new Deployer(hre, wallet);

  const artifactGLD = await deployer.loadArtifact("GLDToken");
  const artifactWETH = await deployer.loadArtifact("WETH9");
    
  // Deploy the ERC20 tokens
  const GLDContract = await deployer.deploy(artifactGLD, ["Gold", "GLD", 18]);
  const GLD2Contract = await deployer.deploy(artifactGLD, ["Gold2", "GLD2", 18]);
  const WETHContract = await deployer.deploy(artifactWETH, []);

  console.log(`GLD address: ${GLDContract.address}`);
  console.log(`GLD2 address: ${GLD2Contract.address}`);
  console.log(`WETH address: ${WETHContract.address}`);

  const balanceGLD0 = await GLDContract.balanceOf(wallet.address);
  console.log(`GLD balance: ${ethers.utils.formatEther(balanceGLD0)}`);
  const balanceGLD20 = await GLD2Contract.balanceOf(wallet.address);
  console.log(`GLD2 balance: ${ethers.utils.formatEther(balanceGLD20)}`);

  const artifactFactory = await deployer.loadArtifact("UniswapV2Factory");
  
  // Deploy this contract. The returned object will be of a `Contract` type, similarly to ones in `ethers`.
  console.log("Deploying UniswapV2Factory......");
  const factory = await deployer.deploy(artifactFactory, [wallet.address]);
  console.log("UniswapV2Factory zkSync contract address: " + factory.address);

  const artifactRouter = await deployer.loadArtifact("contracts/uniswap/UniswapV2Router02.sol:UniswapV2Router02");

  // Deploy this contract. The returned object will be of a `Contract` type, similarly to ones in `ethers`.
  console.log("Deploying UniswapV2Router02......");
  const router = await deployer.deploy(artifactRouter, [factory.address, WETHContract.address]);
  console.log("UniswapV2Router02 zkSync contract address: " + router.address);

  console.log("Deploying Multicall......");
  const artifactMulticall = await deployer.loadArtifact("Multicall");
  const multicall = await deployer.deploy(artifactMulticall, []);

  console.log("Uniswap Contracts deployment done. ")

  console.log(`Approving GLD2 token to router......`);
  let gas = await GLD2Contract.estimateGas.approve(router.address, ethers.constants.MaxUint256);
  let tx = await GLD2Contract.approve(router.address, ethers.constants.MaxUint256, {
    gasLimit: gas,
    gasPrice: ethers.BigNumber.from('0x10000000'),
  });
  await tx.wait();

  console.log(`Approving GLD token to router......`);
  gas = await GLDContract.estimateGas.approve(router.address, ethers.constants.MaxUint256);
  tx = await GLDContract.approve(router.address, ethers.constants.MaxUint256, {
    gasLimit: gas,
    gasPrice: ethers.BigNumber.from('0x10000000'),
  });
  await tx.wait();

  const allowance0 = await GLDContract.allowance(wallet.address, router.address)
  console.log(`GLD allowance: ${ethers.utils.formatEther(allowance0)}`);
  const allowance1 = await GLD2Contract.allowance(wallet.address, router.address)
  console.log(`GLD2 allowance: ${ethers.utils.formatEther(allowance1)}`);

  
  const blockNumber = await provider.getBlockNumber();
  const block = await provider.getBlock(blockNumber);
      
  console.log(`Adding liquidity for GLD-GLD2 pool......`);
  await(
    await router.addLiquidity(
      GLDContract.address,
      GLD2Contract.address,
      ethers.utils.parseEther("1000"),
      ethers.utils.parseEther("1000"),
      ethers.constants.Zero,
      ethers.constants.Zero,
      wallet.address,
      block.timestamp + 10000,
      {
        gasLimit: 2100000,
        gasPrice: ethers.BigNumber.from('0x10000000'),
      }
    )
  ).wait();

  const pairAddress = await factory.getPair(GLD2Contract.address, GLDContract.address);
  console.log(`Pair address: ${pairAddress}`);

  console.log('Updating .env')
  setEnvValue("GLD_TOKEN_ADDRESS", GLDContract.address);
  setEnvValue("GLD2_TOKEN_ADDRESS", GLD2Contract.address);
  setEnvValue("WETH_TOKEN_ADDRESS", WETHContract.address);
  setEnvValue("UNISWAP_V2_ROUTER02_ADDRESS", router.address);
}


export default async function (hre: HardhatRuntimeEnvironment) {
  // const provider = new Provider("https://testnet.era.zksync.dev");
  const provider = new Provider(hre.userConfig.networks?.zkSyncLocalTestnet?.url);

  // The wallet that will deploy the token and the paymaster
  // It is assumed that this wallet already has sufficient funds on zkSync
  const wallet = new Wallet(WALLET_PRIVATE_KEY);

  // The wallet that will receive ERC20 tokens
  console.log(`Imported wallet's address: ${wallet.address}`);
  let balance = await provider.getBalance(wallet.address)
  console.log("Imported wallet's balance on l2: ", ethers.utils.formatEther(balance));

  const emptyWallet = Wallet.createRandom();
  console.log(`Empty wallet's address: ${emptyWallet.address}`);
  console.log(`Empty wallet's private key: ${emptyWallet.privateKey}`);

  const deployer = new Deployer(hre, wallet);

  await deployUniSwapTokenContracts(hre);

  // Deploying the paymaster
  const paymasterArtifact = await deployer.loadArtifact("MySwapPaymaster");
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

  console.log(`Paymaster ETH balance is now ${ethers.utils.formatEther(paymasterBalance.toString())} ETH`);

  console.log(`Updating .env file`);
  setEnvValue("EMPTY_WALLET_PRIVATE_KEY", emptyWallet.privateKey);
  setEnvValue("PAYMASTER_ADDRESS", paymaster.address);

  console.log(`Done!`);
}
