import * as anchor from "@coral-xyz/anchor";
import {Program} from "@coral-xyz/anchor";
import {
    RewardsDistributor,
} from "../target/types/rewards_distributor";
import {Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram} from "@solana/web3.js";
import {deriveEpochPDA} from "../src/utils/pda";
import {BalanceTree} from "../src/libs/balance-tree";
import {beforeEach} from "mocha";
import {confirmedAirdrop} from "./utils";
import {assert, expect} from "chai";

const {
    createMint,
} = require("@solana/spl-token");

describe("corrections tests", () => {
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
    let wrongMint: PublicKey
    let correctMint: PublicKey

    // Create the mints and airdrop to each member involved
    before("create mints and do airdrops", async () => {
        // Mints
        wrongMint = await createMint(
            provider.connection,
            meKeypair, // Payer
            meKeypair.publicKey, // Mint authority
            null, // Freeze authority
            0 // Decimals
        );

        // Mints
        correctMint = await createMint(
            provider.connection,
            meKeypair, // Payer
            meKeypair.publicKey, // Mint authority
            null, // Freeze authority
            0 // Decimals
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

    it("should correct the wrong hash and mint", async () => {
        const receiverKeypair = Keypair.generate();

        // Tree
        const amount = new anchor.BN(10)
        const tree = new BalanceTree([
            {
                account: receiverKeypair.publicKey,
                amount,
            },
        ])
        const correctTreeRoot = Array.from(Uint8Array.from(tree.getRoot()))
        const wrongTreeRoot = new Array<number>(32).fill(0)

        // Add epoch
        const [epoch1, epoch1Bump] = deriveEpochPDA({
            rewardsAccountKey: rewardsAccountKeypair.publicKey,
            epochNr: new anchor.BN(1),
        });
        await program.methods.addEpoch(epoch1Bump, wrongTreeRoot).accounts({
            rewardsAccount: rewardsAccountKeypair.publicKey,
            currentEpochAccount: epoch1,
            mint: wrongMint,
            agent: agentKeypair.publicKey,
            systemProgram: SystemProgram.programId,
        }).signers([agentKeypair]).rpc();
        const initialEpochAccount = await program.account.epochAccount.fetch(epoch1)
        expect(initialEpochAccount.hash).to.deep.equal(wrongTreeRoot, "Root hash should be the wrong one");
        assert(
            initialEpochAccount.mint.equals(wrongMint),
            "Mint should be the wrong one"
        );

        // Correct epoch
        await program.methods.correctEpoch(new anchor.BN(1), correctTreeRoot).accounts({
            agent: agentKeypair.publicKey,
            mint: correctMint,
            rewardsAccount: rewardsAccountKeypair.publicKey,
            epochAccount: epoch1,
        }).signers([agentKeypair]).rpc();

        const correctedEpochAccount = await program.account.epochAccount.fetch(epoch1)
        expect(correctedEpochAccount.hash).to.deep.equal(correctTreeRoot, "Root hash should be the correct one");
        assert(
            correctedEpochAccount.mint.equals(correctMint),
            "Mint should be the correct one"
        );
    })
});
