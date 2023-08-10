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

  console.log(`Creating pair...... ${GLD2Contract.address} - ${GLDContract.address}`);
  let gas = await factory.estimateGas.createPair(GLD2Contract.address, GLDContract.address);
  let tx = await factory.createPair(GLDContract.address, GLD2Contract.address,
    {
      gasLimit: gas.add(1000000),
      gasPrice: ethers.BigNumber.from('0x10000000'),
      type: 0,
    })

  await tx.wait()

  console.log(`Approving GLD2 token to router......`);
  gas = await GLD2Contract.estimateGas.approve(router.address, ethers.constants.MaxUint256);
  tx = await GLD2Contract.approve(router.address, ethers.constants.MaxUint256, {
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

  console.log(`Adding liquidity......`);

  const blockNumber = await provider.getBlockNumber();
  const block = await provider.getBlock(blockNumber);

  tx = await router.addLiquidityETH(
    GLDContract.address,
    ethers.utils.parseEther("1000000000000"),
    10000,
    10000,
    wallet.address,
    block.timestamp + 1000,
    {
      gasLimit: ethers.BigNumber.from(4000000),
      value: ethers.utils.parseEther("0.0001"),
    }
  );
  await tx.wait()

  const pairAddress = await factory.getPair(WETHContract.address, GLDContract.address);
  console.log(`Pair balance: ${pairAddress}`);

  // const artifactPair = hre.artifacts.readArtifactSync("UniswapV2Pair");
  // const pair = new ethers.Contract(pairAddress, artifactPair.abi, wallet);

  // const balance = await pair.balanceOf(wallet.address);
  // console.log(`LP balance: ${ethers.utils.formatEther(balance)}`);

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
