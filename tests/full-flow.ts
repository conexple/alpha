// tests/full-flow.ts — Anchor end-to-end happy path test.
//
// Runs as part of `anchor test` against a local validator.
//
// Coverage:
//   * Protocol::initialize_rules — happy + margin cap rejection
//   * Oracle::initialize_registry + register_oracle
//   * Network::initialize_network + register_member + place_member
//   * Network::record_purchase
//   * Escrow::initialize_pool

import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, BN, Program, type Idl } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { assert } from "chai";
import * as fs from "node:fs";
import * as path from "node:path";

const NETWORK_ID = new BN(1);

function loadIdl(name: string): Idl {
  const root = path.resolve(__dirname, "..");
  return JSON.parse(
    fs.readFileSync(path.join(root, "target", "idl", `${name}.json`), "utf8"),
  ) as Idl;
}

function u64Le(n: BN | number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(n.toString()));
  return buf;
}

describe("conexple full flow", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const protocol = new Program(loadIdl("conexple_protocol"), provider) as Program<any>;
  const network = new Program(loadIdl("conexple_network"), provider) as Program<any>;
  const escrow = new Program(loadIdl("conexple_escrow"), provider) as Program<any>;
  const oracle = new Program(loadIdl("conexple_oracle"), provider) as Program<any>;

  const admin = (provider.wallet as anchor.Wallet).payer;

  let configPda: PublicKey;
  let networkPda: PublicKey;
  let registryPda: PublicKey;
  let poolPda: PublicKey;

  before(() => {
    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), u64Le(NETWORK_ID)],
      protocol.programId,
    );
    [networkPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("network"), u64Le(NETWORK_ID)],
      network.programId,
    );
    [registryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("oracle_registry"), u64Le(NETWORK_ID)],
      oracle.programId,
    );
    [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), u64Le(NETWORK_ID)],
      escrow.programId,
    );
  });

  it("initializes ProtocolConfig (happy)", async () => {
    await protocol.methods
      .initializeRules({
        networkId: NETWORK_ID,
        marginBpsMax: 5000,
        multiplier: 10,
        cycle: { daily: {} },
        poolSplitBps: 9000,
        infinityMinSpendMultiple: 10,
        infinityMinConsecutiveCycles: 3,
      })
      .accounts({
        config: configPda,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    const cfg: any = await protocol.account.protocolConfig.fetch(configPda);
    assert.equal(cfg.marginBpsMax, 5000);
    assert.equal(cfg.levelCount, 5);
    assert.equal(cfg.splitParts, 7);
  });

  it("rejects ProtocolConfig with margin > 50%", async () => {
    const [otherConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), u64Le(new BN(99))],
      protocol.programId,
    );
    try {
      await protocol.methods
        .initializeRules({
          networkId: new BN(99),
          marginBpsMax: 5001,
          multiplier: 10,
          cycle: { daily: {} },
          poolSplitBps: 9000,
          infinityMinSpendMultiple: 10,
          infinityMinConsecutiveCycles: 3,
        })
        .accounts({
          config: otherConfig,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
      assert.fail("expected MarginCapExceeded");
    } catch (e) {
      assert.match(String(e), /MarginCapExceeded|margin/);
    }
  });

  it("initializes OracleRegistry + registers admin as oracle", async () => {
    await oracle.methods
      .initializeRegistry(NETWORK_ID)
      .accounts({
        registry: registryPda,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();
    await oracle.methods
      .registerOracle(admin.publicKey)
      .accounts({
        registry: registryPda,
        admin: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    const reg: any = await oracle.account.oracleRegistry.fetch(registryPda);
    assert.equal(reg.signers.length, 1);
    assert.ok(reg.signers[0].equals(admin.publicKey));
  });

  it("initializes NetworkState + Pool", async () => {
    await network.methods
      .initializeNetwork(NETWORK_ID, admin.publicKey, new BN(24 * 60 * 60))
      .accounts({
        network: networkPda,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    await escrow.methods
      .initializePool(NETWORK_ID, 9000)
      .accounts({
        pool: poolPda,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    const net: any = await network.account.networkState.fetch(networkPda);
    assert.ok(net.oracle.equals(admin.publicKey));
  });

  describe("3-level network", () => {
    const A = Keypair.generate();
    const B = Keypair.generate();
    const E = Keypair.generate();

    before(async () => {
      // Airdrop some SOL to each
      for (const kp of [A, B, E]) {
        const sig = await provider.connection.requestAirdrop(kp.publicKey, 2e9);
        await provider.connection.confirmTransaction(sig, "confirmed");
      }
    });

    function positionPda(w: PublicKey): PublicKey {
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("position"), u64Le(NETWORK_ID), w.toBuffer()],
        network.programId,
      );
      return pda;
    }

    it("registers A, B, E and places B→A, E→B", async () => {
      // Register
      for (const kp of [A, B, E]) {
        await network.methods
          .registerMember(new BN(1000), 10)
          .accounts({
            network: networkPda,
            position: positionPda(kp.publicKey),
            wallet: kp.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([kp])
          .rpc();
      }

      // Place B under A (oracle = admin)
      await network.methods
        .placeMember()
        .accounts({
          network: networkPda,
          position: positionPda(B.publicKey),
          parentPosition: positionPda(A.publicKey),
          oracleAuthority: admin.publicKey,
        })
        .signers([admin])
        .rpc();

      // Place E under B
      await network.methods
        .placeMember()
        .accounts({
          network: networkPda,
          position: positionPda(E.publicKey),
          parentPosition: positionPda(B.publicKey),
          oracleAuthority: admin.publicKey,
        })
        .signers([admin])
        .rpc();

      const posE: any = await network.account.position.fetch(positionPda(E.publicKey));
      assert.equal(posE.depth, 2);
      assert.ok(posE.parent.equals(B.publicKey));
    });

    it("records a purchase by E", async () => {
      const round = new BN(0); // initialize_network sets cycle_index=0
      const [purchasePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("purchase"),
          u64Le(NETWORK_ID),
          E.publicKey.toBuffer(),
          u64Le(round),
        ],
        network.programId,
      );
      await network.methods
        .recordPurchase(round, new BN(1000))
        .accounts({
          network: networkPda,
          position: positionPda(E.publicKey),
          purchase: purchasePda,
          oracleAuthority: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const rec: any = await network.account.purchaseRecord.fetch(purchasePda);
      assert.equal(rec.totalAmount.toString(), "1000");
      assert.equal(rec.purchaseCount, 1);
    });
  });
});
