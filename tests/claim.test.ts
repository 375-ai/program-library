import * as anchor from "@coral-xyz/anchor";
import {Program} from "@coral-xyz/anchor";
import {
    RewardsDistributor,
} from "../target/types/rewards_distributor";
import {Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram} from "@solana/web3.js";
import {deriveEpochPDA, findClaimStatusKey} from "../src/utils/pda";
import {BalanceTree} from "../src/libs/balance-tree";
import {beforeEach} from "mocha";
import {TOKEN_PROGRAM_ID} from "@solana/spl-token";
import {confirmedAirdrop} from "./utils";

const {
    createMint,
    createAccount,
    mintTo,
    getAssociatedTokenAddress,
} = require("@solana/spl-token");

describe("claim tests", () => {
    // Configure the client to use the local cluster.
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const myWallet = provider.wallet as anchor.Wallet
    const meKeypair = myWallet.payer

    // Keypairs
    const rewardsAccountKeypair = Keypair.generate();
    const managerKeypair = meKeypair
    const agentKeypair = Keypair.generate();

    // Mint
    let mint: PublicKey
    let managerTokenAccount: PublicKey

    // Create the mint and airdrop to each member involved
    before("create mint and do airdrops", async () => {
        // Mint
        mint = await createMint(
            provider.connection,
            meKeypair, // Payer
            meKeypair.publicKey, // Mint authority
            null, // Freeze authority
            0 // Decimals
        );

        // Create the manager ATA
        managerTokenAccount = await createAccount(
            provider.connection,
            meKeypair, // Payer
            mint, // Mint
            managerKeypair.publicKey // Owner
        );

        // Mint to manager
        await mintTo(
            provider.connection,
            meKeypair, // Payer
            mint, // Mint
            managerTokenAccount, // Destination
            meKeypair, // Authority
            10_000, // Amount
            [], // Multi signers
            undefined, // Confirm options
            TOKEN_PROGRAM_ID
        );

        // Airdrops
        await confirmedAirdrop(
            provider.connection,
            agentKeypair.publicKey,
            LAMPORTS_PER_SOL // 1 SOL
        );

        // Manager doesn't need airdrop because the manager is the Anchor wallet
    })

    // Initialize a new account each time
    let program: Program<RewardsDistributor>
    beforeEach("initialize", async () => {
        program = anchor.workspace.RewardsDistributor as Program<RewardsDistributor>;
        await program.methods
            .initialize(agentKeypair.publicKey)
            .accounts({
                manager: managerKeypair.publicKey,
                rewardsAccount: rewardsAccountKeypair.publicKey,
            })
            .signers([rewardsAccountKeypair])
            .rpc();
    });

    it("should claim from multiple epochs", async () => {
        const receiverKeypair = Keypair.generate();

        // Tree
        const amount = new anchor.BN(10)
        const tree = new BalanceTree([
            {
                account: receiverKeypair.publicKey,
                amount,
            },
        ])
        const treeRoot = Array.from(Uint8Array.from(tree.getRoot()))

        // Proof
        const leafIndex = new anchor.BN(0)
        const proof = tree.getProof(leafIndex.toNumber(), receiverKeypair.publicKey, amount).map((e) =>
            Array.from(Uint8Array.from(e))
        )

        // Add epoch 1
        const [epoch1, epoch1Bump] = deriveEpochPDA({
            rewardsAccountKey: rewardsAccountKeypair.publicKey,
            epochNr: new anchor.BN(1),
        });
        await program.methods.addEpoch(epoch1Bump, treeRoot).accounts({
            rewardsAccount: rewardsAccountKeypair.publicKey,
            currentEpochAccount: epoch1,
            mint,
            agent: agentKeypair.publicKey,
            systemProgram: SystemProgram.programId,
        }).signers([agentKeypair]).rpc();

        // Approve epoch 1
        await program.methods.approveEpoch(new anchor.BN(1), amount).accounts({
            rewardsAccount: rewardsAccountKeypair.publicKey,
            epochAccount: epoch1,
            manager: managerKeypair.publicKey,
            epochTokenAccount: await getAssociatedTokenAddress(mint, epoch1, true),
            managerTokenAccount: await getAssociatedTokenAddress(mint, managerKeypair.publicKey),
            mintAccount: mint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        }).signers([managerKeypair]).rpc();

        // Add epoch 2
        const [epoch2, epoch2Bump] = deriveEpochPDA({
            rewardsAccountKey: rewardsAccountKeypair.publicKey,
            epochNr: new anchor.BN(2),
        });
        await program.methods.addEpoch(epoch2Bump, treeRoot).accounts({
            rewardsAccount: rewardsAccountKeypair.publicKey,
            currentEpochAccount: epoch2,
            mint,
            agent: agentKeypair.publicKey,
            systemProgram: SystemProgram.programId,
        }).signers([agentKeypair]).rpc()

        // Approve epoch 2
        await program.methods.approveEpoch(new anchor.BN(2), amount).accounts({
            rewardsAccount: rewardsAccountKeypair.publicKey,
            epochAccount: epoch2,
            manager: managerKeypair.publicKey,
            epochTokenAccount: await getAssociatedTokenAddress(mint, epoch2, true),
            managerTokenAccount: await getAssociatedTokenAddress(mint, managerKeypair.publicKey),
            mintAccount: mint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        }).signers([managerKeypair]).rpc();

        // Airdrop for claimer
        await confirmedAirdrop(
            provider.connection,
            receiverKeypair.publicKey,
            LAMPORTS_PER_SOL // 1 SOL
        );

        // Claim for epoch 1
        await program.methods.claim(leafIndex, amount, proof).accounts({
            rewardsAccount: rewardsAccountKeypair.publicKey,
            epochAccount: epoch1,
            claimStatus: findClaimStatusKey({
                rewardsAccountKey: rewardsAccountKeypair.publicKey,
                index: leafIndex,
                epochAccount: epoch1,
                program: program.programId
            })[0],
            from: await getAssociatedTokenAddress(mint, epoch1, true),
            to: await getAssociatedTokenAddress(mint, receiverKeypair.publicKey),
            receiver: receiverKeypair.publicKey,
            mintAccount: mint,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
        }).signers([receiverKeypair]).rpc();

        // Claim for epoch 2
        await program.methods.claim(leafIndex, amount, proof).accounts({
            rewardsAccount: rewardsAccountKeypair.publicKey,
            epochAccount: epoch2,
            claimStatus: findClaimStatusKey({
                rewardsAccountKey: rewardsAccountKeypair.publicKey,
                index: leafIndex,
                epochAccount: epoch2,
                program: program.programId
            })[0],
            from: await getAssociatedTokenAddress(mint, epoch2, true),
            to: await getAssociatedTokenAddress(mint, receiverKeypair.publicKey),
            receiver: receiverKeypair.publicKey,
            mintAccount: mint,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
        }).signers([receiverKeypair]).rpc();
    })
});
