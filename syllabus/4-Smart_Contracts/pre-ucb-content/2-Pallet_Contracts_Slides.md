---
title: Contracts Pallet
description: pallet-contracts for Web3 Engineers.
duration: 1 hour
---

# Contracts Pallet

Notes:

- We have learned why smart contracts are useful and why we want to have them in out blockchain.
- In order to offer this functionality we need to have a piece of software in our runtime that executes them
- Substrate includes `pallet-contracts` which executes WebAssembly (wasm) based smart contracts
- WebAssembly smart contracts only refer to the bytecode used to express the contracts
- There are a lot of different ways you could implement a wasm based smart contract platform
- `pallet-contracts` is one opinionated way of doing this.
  It stays purposefully close to the EVM way
  of doing this (synchronous cross contract calls) while differentiating itself in some key areas.
  - We will learn about this in the next chapter

---

## WebAssembly

<img src="../img/pallet/wasm_logo.svg" style="width: 400px" />

Notes:

- WebAssembly (sometimes abbreviated Wasm) defines a portable binary-code format and a corresponding text format for executable programs as well as software interfaces for facilitating interactions between such programs and their host environment.
- In order to understand how WebAssembly (abbreviated Wasm) contracts are constructed we just
  need to understand the general concept.
  No detailed knowledge is required.
- However, because of its generality it can be used in other domains.
- It is usually not written by hand but generated by a compiler.
  In our case: Rust.
  - Other languages exist targeting `pallet-contracts` and hence Wasm
    - [Solidity](https://github.com/hyperledger-labs/solang)
    - [Assembly Script](https://github.com/ask-lang/ask)
- [Easy to understand spec](https://webassembly.github.io/spec/core/intro/index.html)

---

## Minimal example

```Rust
fn factorial(n: u64) -> u64 {
  if n == 0 {
    1
  } else {
    n * factorial(n - 1)
  }
}
```

```WebAssembly
(func (param i64) (result i64)
  local.get 0     ;; stack[0] := n
  i64.eqz         ;; stack[0] := stack[0] == 0 ? 1 : 0
  if (result i64)
    i64.const 1   ;; stack[0] := 1
  else
    local.get 0   ;; stack[0] := n
    local.get 0   ;; stack[0] := n
    i64.const 1   ;; stack[0] := 1
    i64.sub       ;; stack[0] := stack[1] - stack[0]
    call 0        ;; stack[0] := factorial(stack[0])
    i64.mul       ;; stack[0] := stack[1] * stack[0]
  end
)
```

Notes:

- This format is called 'wat' and is essentially a wasm assembler.
- It is compiled to a binary format like any asm would be compiled to machine code.
- As we can see here Wasm is a stack machine: Instructions push results to the stack and
  use values on the stack as arguments.
  - Register machines use registers for passing values to instructions as a primary mechanism.
- Entities within a Wasm code file (Wasm module) are enumerated by their appearance (starting with 0).
  - Calling the first defined function is accomplished via `call 0` for example
  - Parameters of functions are variables and are ordered before any variables of the function themselves.
  - `local.get 0` fetches the first parameter of a function

---

## Wat Syntax Sugar

```WebAssembly
(func $factorial (param $n i64) (result i64)
  (if (result i64) (i64.eqz (local.get 0))
    (then
      (i64.const 1)
    )
    (else
      (i64.mul
        (local.get 0)
        (call $factorial (i64.sub (local.get $n) (i64.const 1)))
      )
    )
  )
)
```

Notes:

- Wat has some features that allow for better readability:
  - Stack push operations can be grouped to its consuming instruction.
  - Labels can be applied to elements.
  - Blocks can enclosed with parenthesis instead of explicit start/end instructions.
- When writing wat by hand these features are very welcome.
  - Hand written wat is mostly used for test fixtures.

---

## Linear Memory

```Rust
fn write_to_mem(val: u64, address: &mut u64) {
    *address = val;
}
```

```WebAssembly
(func (param i64 i32)
  (i64.store (local.get 1) (local.get 0))
)
```

Notes:

- In addition to the stack Wasm also has linear memory.
  This is byte addressable and can be manipulated
  using `x.store` and `x.load` which stored and loads primitives from and to the stack.
  Instructions
  never operate directly on linear memory.
  - The target address is taken from the stack and can be adjusted by passing an offset as immediate.
- The Rust compiler uses for dynamic/heap memory and to pass non primitives to functions by emulating
  an additional stack within the linear memory it allocates at some offset.
  - This emulated stack is what we would understand as stack in other architectures.
  - The Wasm stack on the other would be implemented using registers in other architectures.

---

## Embedding Wasm

<img rounded src="../img/pallet/wasm_embed.png" style="width: 1400px" />

Notes:

- WebAssembly is meant to be embedded by other applications as a way to express logic in a platform
  independent way.
  The application including the WasmVM is called the "embedder".
  A programming
  language that is often used in a similar way is LUA.
  This is often called "scripting".
  "Embedder" is WebAssembly lingo and used in that way in the standard.
- The embedder here is our blockchain's runtime which wants to execute some logic defined in
  a platform independent way (contracts).
- Another popular embedder is a web browser.
- The embedder defines which functions can be called by the Wasm code and which functions it
  expects to be present in the Wasm code.

---

## Anatomy of a Contract

```WebAssembly
(module
  ;; params: data_ptr, data_len_ptr
  (import "seal0" "seal_input" (func $seal_input (param i32 i32)))
  (import "env" "memory" (memory 1 1))

  (func (export "deploy")
    ;; execute some code on contract deployment (we do nothing)
  )

  (func (export "call")
    ;; execute some code on contract execution
    (i32.store (i32.const 4) (i32.const 256)) ;; store the length of our buffer at mem[4]
    (call $seal_input (i32.const 0) (i32.const 4)) ;; copy input buffer to mem[0]
  )
)
```

Notes:

- The standard does not only include the binary instruction set but also the way the code is
  bundled for consumption.
- This bundle is called a Wasm module and is what an ELF file is to classical instruction sets.
  It is
  structured in that it contains different entities like functions, data and not only code that is to
  be run.
- Each embedder provides the environment.
  The most important properties of this environment are:
  - List of functions ("imported functions") which can be called by the Wasm blob to interact with
    the environment (e.G `seal_return`).
    The identifier of an import consists of a `module` and a `name`.
    Those don't have any meaning and can be chosen by the embedder completely arbitrarily.
    While
    any byte sequence can be used it is customary to make them human readable (ASCII).
    The `module`
    is usually used for namespacing.
  - List of entry points ("exported functions") the the embedder expects to be present in the Wasm
    module.
    The embedder would call these functions at pre-defined points in time.
    For example,
    `pallet-contracts` expects two functions to be present: `deploy` and `call`.
  - Input and output is passed through linear memory.
- `pallet-contracts` acts as such an embedder and hence contracts are defined in terms of a Wasm
  module according to the environment defined by `pallet-contracts`.
- `seal_input` is used to copy the input buffer to local memory where it can be further processed.
  - Second argument is an in-out pointer which is used to pass in the buffer length and pass out
    the actual size of the input.
  - Execution ends with an error if the specified buffer can't fit the whole input.
  - Every function offered by pallet-contracts that the contract wants to use needs to be
    explicitly imported.

---

## Architecture of pallet-contracts

<img rounded src="../img/pallet/arch.png" style="width: 800px" />

---

## Dispatchables

<img rounded src="../img/pallet/arch_dispatchable.png" style="width: 1200px" />

Notes:

- Dispatchables are functions exposed by pallets than can be referenced in an signed extrinsic
  in order execute some code on-chain.
  For normal pallets this is fixed functionality.
  For contracts however, we can trigger execution of previously stored (also using dispatchables)
  Wasm code.
- Once it is included into the runtime it makes the following dispatchables available for
  a extrinsics (the argument list is shortened):
  - `upload_code(code: Vec<u8>)`: We differentiate between "code" and contract".
    This uploads a Wasm module that can be referenced by its hash in other extrinsics.
    It will validate, instrument and finally store the code on-chain.
    With code we just mean a Wasm module while a contract is an account that has state attached to it that is governed by some previously uploaded code instead of a
    private key.
  - `instantiate(code_hash: CodeHash, input: Vec<u8>, salt: Vec<u8>)`: Creates a new contract using the specified
    `code_hash`.
    It's state is initialized by the `deploy` function defined in its code.
    By branching
    on the `input` different contract instances can be instantiated from the same code.
    The contracts account id is derived deterministically:
    `hash(instantiating_account ++ code_hash ++ salt)`.
    Without the salt instantiating the same code
    from the same account would be impossible.
  - `call(account: AccountId, input: Vec<u8>)`: Call an existing contract.
    This will execute the
    `call` function exported by the contracts code.

---

## RPCs

<img rounded src="../img/pallet/arch_rpc.png" style="width: 1000px" />

Notes:

- RPCs are functions exposed by a node via network
- Some of them are general functions exposed by any node: (e.G `get_storage`)
- `pallet-contracts` adds additional RPC which are essentially mirrors of its dispatchables
  to allow clients (wallets, dapps) to dry-run any contract execution before submitting it
  as an extrinsic
- The main reason to do dry runs to estimate gas usage and to extract data from a contract
- For read-only contract executions a client would only call the RPC without submitting
  an extrinsic as extrinsics can't return any data
- RPCs do cannot mutate any state because they are only executed by one node as opposed to every
  node as in the case of an extrinsic submission

---

## API Definition (1)

```Rust
#[define_env(doc)]
pub mod Env {
  #[version(0)]
  fn gas(ctx, amount: u32) { ... },

  #[version(0)]
  fn get_storage(ctx, key_ptr: u32, value_ptr: u32, value_len: u32) { ... },

  #[version(1)]
  fn set_storage(ctx, key_ptr: u32, value_ptr: u32, value_len: u32) -> u32 { ... },

  #[version(0)]
  fn clear_storage(ctx, key_ptr: u32) { ... },

  #[version(0)]
  #[unstable]
  fn clear_storage(ctx, key_ptr: u32, key_len: u32) -> u32 { ... },

  #[version(1)]
  fn call(
    ctx,
    flags: u32,
    callee_ptr: u32,
    gas: u64,
    value_ptr: u32,
    input_data_ptr: u32,
    input_data_len: u32,
    output_ptr: u32,
    output_len_ptr: u32
  ) -> ReturnCode { ... },
}
```

Notes:

- The set of functions a contract can call (imported functions in Wasm lingo) are defined in
  `wasm/runtime.rs` within the `mod env` module.
- The macro generates a list of imports from its arguments: The identifier in square brackets
  becomes the `module` and the name of the functions becomes the `name`.
- We use the `module` for versioning: To stay backwards compatible we add new versions of a function
  instead of changing the existing one.
  We increment the number for every new version.
- An API flagged `#[unstable]` module is for new functions whose API is not yet finalized.
  Functions start out
  in this state when they are added and can be changed because production deployments won't make this functions available.
- The body of the functions is what is executed within the embedder (`pallet-contracts` in this case).
- Only primitives (`i32`, `i64`) can be used as arguments or return type.
  Larger types are passed by
  pointer and are serialized using SCALE.
- This list of function can be extended by the runtime by a mechanism called chain extension.
  - This is a type implementing `trait ChainExtension` passed in via the `Config` trait.
- `gas` is a special import that is only called injected code in order to meter executed instructions.

---

## API Definition (2)

[`API docs`](https://docs.rs/pallet-contracts/latest/pallet_contracts/api_doc/index.html)

<img src="../img/pallet/api.png" style="width: 1100px" />

---

<!-- .slide: data-background-color="#4A2439" -->

## Activity: ink!less-flipper

> Implement the infamous ink! flipper example in pure Rust

Notes:

Move to the per-cohort generated link (on notion of whatever is used to share repo invitations for this cohort.

---

## Configuration

```Rust
#[pallet::config]
pub trait Config: frame_system::Config {
    /// The generator used to supply randomness to contracts through `seal_random`.
    type Randomness: Randomness<Self::Hash, Self::BlockNumber>;

    /// The currency in which fees are paid and contract balances are held.
    type Currency: ReservableCurrency<Self::AccountId>;

    /// Filter that is applied to calls dispatched by contracts.
    ///
    /// Use this filter to control which dispatchables are callable by contracts.
    /// This is applied in **addition** to [`frame_system::Config::BaseCallFilter`].
    /// It is recommended to treat this as a whitelist.
    ///
    /// # Stability
    ///
    /// The runtime **must** make sure that all dispatchables that are callable by
    /// contracts remain stable. In addition [`Self::Call`] itself must remain stable.
    /// This means that no existing variants are allowed to switch their positions.
    ///
    /// # Note
    ///
    /// Note that dispatchables that are called via contracts do not spawn their
    /// own wasm instance for each call (as opposed to when called via a transaction).
    /// Therefore please make sure to be restrictive about which dispatchables are allowed
    /// in order to not introduce a new DoS vector like memory allocation patterns that can
    /// be exploited to drive the runtime into a panic.
    type CallFilter: Contains<<Self as frame_system::Config>::Call>;

    /// Used to answer contracts' queries regarding the current weight price. This is **not**
    /// used to calculate the actual fee and is only for informational purposes.
    type WeightPrice: Convert<Weight, BalanceOf<Self>>;

    /// Describes the weights of the dispatchables of this module and is also used to
    /// construct a default cost schedule.
    type WeightInfo: WeightInfo;

    /// Type that allows the runtime authors to add new host functions for a contract to call.
    type ChainExtension: chain_extension::ChainExtension<Self>;

    /// Cost schedule and limits.
    #[pallet::constant]
    type Schedule: Get<Schedule<Self>>;

    /// The type of the call stack determines the maximum nesting depth of contract calls.
    ///
    /// The allowed depth is `CallStack::size() + 1`.
    /// Therefore a size of `0` means that a contract cannot use call or instantiate.
    /// In other words only the origin called "root contract" is allowed to execute then.
    type CallStack: smallvec::Array<Item = Frame<Self>>;

    /// The maximum number of contracts that can be pending for deletion.
    ///
    /// When a contract is deleted by calling `seal_terminate` it becomes inaccessible
    /// immediately, but the deletion of the storage items it has accumulated is performed
    /// later. The contract is put into the deletion queue. This defines how many
    /// contracts can be queued up at the same time. If that limit is reached `seal_terminate`
    /// will fail. The action must be retried in a later block in that case.
    ///
    /// The reasons for limiting the queue depth are:
    ///
    /// 1. The queue is in storage in order to be persistent between blocks. We want to limit
    /// 	the amount of storage that can be consumed.
    /// 2. The queue is stored in a vector and needs to be decoded as a whole when reading
    ///		it at the end of each block. Longer queues take more weight to decode and hence
    ///		limit the amount of items that can be deleted per block.
    #[pallet::constant]
    type DeletionQueueDepth: Get<u32>;

    /// The maximum amount of weight that can be consumed per block for lazy trie removal.
    ///
    /// The amount of weight that is dedicated per block to work on the deletion queue. Larger
    /// values allow more trie keys to be deleted in each block but reduce the amount of
    /// weight that is left for transactions. See [`Self::DeletionQueueDepth`] for more
    /// information about the deletion queue.
    #[pallet::constant]
    type DeletionWeightLimit: Get<Weight>;

    /// The amount of balance a caller has to pay for each byte of storage.
    ///
    /// # Note
    ///
    /// Changing this value for an existing chain might need a storage migration.
    #[pallet::constant]
    type DepositPerByte: Get<BalanceOf<Self>>;

    /// The weight per byte of code that is charged when loading a contract from storage.
    ///
    /// Currently, FRAME only charges fees for computation incurred but not for PoV
    /// consumption caused for storage access. This is usually not exploitable because
    /// accessing storage carries some substantial weight costs, too. However in case
    /// of contract code very much PoV consumption can be caused while consuming very little
    /// computation. This could be used to keep the chain busy without paying the
    /// proper fee for it. Until this is resolved we charge from the weight meter for
    /// contract access.
    ///
    /// For more information check out: <https://github.com/paritytech/substrate/issues/10301>
    ///
    /// [`DefaultContractAccessWeight`] is a safe default to be used for Polkadot or Kusama
    /// parachains.
    ///
    /// # Note
    ///
    /// This is only relevant for parachains. Set to zero in case of a standalone chain.
    #[pallet::constant]
    type ContractAccessWeight: Get<Weight>;

    /// The amount of balance a caller has to pay for each storage item.
    ///
    /// # Note
    ///
    /// Changing this value for an existing chain might need a storage migration.
    #[pallet::constant]
    type DepositPerItem: Get<BalanceOf<Self>>;

    /// The address generator used to generate the addresses of contracts.
    type AddressGenerator: AddressGenerator<Self>;

    /// The maximum length of a contract code in bytes. This limit applies to the instrumented
    /// version of the code. Therefore `instantiate_with_code` can fail even when supplying
    /// a wasm binary below this maximum size.
    type MaxCodeLen: Get<u32>;

    /// The maximum length of a contract code after reinstrumentation.
    ///
    /// When uploading a new contract the size defined by [`Self::MaxCodeLen`] is used for both
    /// the pristine **and** the instrumented version. When a existing contract needs to be
    /// reinstrumented after a runtime upgrade we apply this bound. The reason is that if the
    /// new instrumentation increases the size beyond the limit it would make that contract
    /// inaccessible until rectified by another runtime upgrade.
    type RelaxedMaxCodeLen: Get<u32>;

    /// The maximum allowable length in bytes for storage keys.
    type MaxStorageKeyLen: Get<u32>;
}
```

Notes:

- `pallet-contracts` has an extensive `Config` trait to adapt it to the runtimes use case
- The `Schedule` is a large struct that contains the weights for every instruction and
  imported function
  - Those are determined by a benchmark suite contained in `pallet-contracts`
  - It has a sane `Default` implementation but can be customized
- `ChainExtension` can be to add further functions to the API

---

## Gas / Weight

```Rust
#[pallet::weight(T::WeightInfo::call().saturating_add(*gas_limit))]
pub fn call(
  origin: OriginFor<T>,
  dest: <T::Lookup as StaticLookup>::Source,
  #[pallet::compact] value: BalanceOf<T>,
  #[pallet::compact] gas_limit: Weight,
  storage_deposit_limit: Option<<BalanceOf<T> as codec::HasCompact>::Type>,
  data: Vec<u8>,
) -> DispatchResultWithPostInfo
```

> Why is it important to set DispatchResultWithPostInfo as return type?

<!-- .element: class="fragment" -->

Notes:

- Just as on ethereum we make use of gas metering in order to make sure a contract execution
  terminates and fee the sender accordingly.
- We don't need to do that for the runtime itself because that code is trusted to not use more
  computation that that it promises to.
  We can't trust contract code to do so because that code
  can be uploaded by users as opposed to the author of the chain's runtime.
- The concept of gas is unified with weight.
  The word gas is sometimes used when talking about
  smart contracts but it can be used interchangeably with weight.
- As a reminder: One weight is one picosecond of execution time on whatever hardware was defined
  as the reference for the runtime in question.
- Just as for any other pallet there is a weight value assigned to each dispatchable.
  However,
  we can't know the a-priori weight for arbitrary code execution and therefore we need to resort
  to metering:
  The pre-dispatch weight is set to whatever is passed as the `gas_limit`.
  After the execution we learn
  the exact weight (post-dispatch weight) through metering and refund the difference.
- We opt into that post-dispatch weight correcting by return `DispatchResultWithPostInfo`.
- Metering works by assigning a weight value to each Wasm instruction and each imported function
  and then dynamically keep track of what is used.

---

## Execution Engine

<img src="../img/pallet/exec.png" style="width: 800px" />

> What could be problematic about putting the execution engine into the client?

<!-- .element: class="fragment" -->

Notes:

- After covering the structure of a contract and the pallet we have a look at the part which
  actually runs the Wasm code.
  Wasm is a virtual machine so we need some software to execute
  it on out real world computer.
- We call this part the "execution engine" and is the part that implements the Wasm instruction
  set and actually runs the code.
- Please note that this is often referred to as "VM" but this can be misleading because that
  definition is blurry: Often it also includes embedder which would be the whole `pallet-contracts`.
- We use the term "execution engine" to make this distinction clear.
- An open question is whether it is worth it to use a (JIT) compiler instead of a an interpreter
  for contracts.
  Reason is that it is hard to tell whether the compilation overhead can be
  recuperated by faster execution given the usually I/O heavy contract work loads.
  This is why
  we compare the two approaches in this chapter.
- Interpreters
  - Run through the code instruction by instruction
  - Slow to execute code when compared to a JIT compiler
  - Platform independent (can be included into runtime)
  - Immediate startup as no time is spent on compilation
- JIT
  - Emit native assembly and executes it
  - Only single pass compilers can be used for contracts as optimizing compilers use non
    linear algorithms which would be prone to DoS attacks.
  - Single pass compilers produce way slower code than optimizing compilers.
  - Cannot be included into the runtime

---

## pallet-contracts uses `wasmi` for now

<img rounded src="../img/pallet/wasmi.png" style="width: 1200px" />

Notes:

- We use an interpreter for now as it allows us to stay flexible and iterate with only
  an runtime upgrade until it becomes clear whether a JIT brings a real word improvement
- We have experimental support for wasmer singlepass in Substrate but the performance
  measurement are inconclusive.
- We monitor performance and might switch to a different approach in the future
- The runtime itself uses wasmtime but we can't use this for contracts because it doesn't include
  a singlepass compiler.

---

## Making gas metering<br/>independent of the executor (1)

<img rounded src="../img/pallet/gas.png" style="width: 200px;" />

Notes:

- During execution we need to make sure that the contract doesn't exhaust the `gas_limit`.
- The execution engine could keep track of this but this would make gas dependant on
  the execution engine used.
- Instead, we have an instrumentation step when uploading code that injects the metering
  logic as Wasm code.
  This way it works consistently across every Wasm conformant
  execution engine without any modification.

---

## Making gas metering<br/>independent of the executor (2)

<div style="font-size: 0.77em;">

```WebAssembly
(module
  (import "env" "gas" (func $gas (param i32)))

  (func $factorial (param $n i64) (result i64)
    (call $gas
      (i32.const 3)
    )
    (if (result i64) (i64.eqz (local.get 0))
      (then
        (call $gas
          (i32.const 1)
        )
        (i64.const 1)
      )
      (else
        (call $gas
          (i32.const 6)
        )
        (i64.mul
          (local.get 0)
          (call $factorial (i64.sub (local.get $n) (i64.const 1)))
)))))
```

> What is a drawback of this approach?

<!-- .element: class="fragment" -->

</div>

Notes:

- It works by injecting a call to the `gas` imported function for stream of uninterruptible
  instructions (basic block).
  This functionality is implemented by the `wasm-instrument`
  crate.
- The `$gas` function is implemented within `pallet-contracts`
- Calling imported functions is slow
- We work on a [more performant solution](https://github.com/paritytech/wasm-instrument/issues/11) that doesn't call any imported functions as those carry significant overhead.

---

## Storage Bloat

<img rounded src="../img/pallet/bloat.jpg" alt="Source: https://www.coindesk.com/markets/2018/01/18/blockchain-bloat-how-ethereum-is-tackling-storage-issues/" style="width: 1000px;" />

Notes:

- Contract hosting chains tend to be heavy on the state size
- The code itself is part of the state
- Contract authors if not properly incentivized have no reason to save storage
- This is a problem: Increases the cost to run a node for every network participant

---

## Storage on Ethereum

<img rounded src="../img/pallet/eth_state.png" alt="Source: https://ycharts.com/indicators/ethereum_chain_full_sync_data_size" style="width: 1000px;" />

Notes:

- Ethereum doesn't set enough incentives to remove state
- No consequences keeping unused data around: The state grows faster than necessary
- Hard to retrofit a solution
- We want to do better when starting fresh

---

## First try: Storage rent

<img rounded src="../img/pallet/rent.jpg" alt="Source: https://www.investopedia.com/articles/personal-finance/041515/buying-second-home-rent-dos-and-donts.asp" style="width: 800px;" />

Notes:

- One way to deal with this situation is to charge rent from a contracts balance per block
  and remove the contract's state from the chain when it isn't topped up.
  It can be
  reactivated re-uploading the state.
- This leaves the contract in full control of its financing model because no assumptions
  are made of wo pays for the storage: A contract could include logic to make users pays
  for it or rely on some interested third party to keep it alive.
- However, it turned out that the logic required to implement this logic dominated
  the actual logic of the contract.
  Hence we switched to a more opinionated model.

---

## What we have now:<br/>Automatic storage deposits

<img rounded src="../img/pallet/deposit.jpg" alt="Source: https://m.bankingexchange.com/news-feed/item/7869-bank-deposits-the-most-important-number-on-the-balance-sheet" style="width: 700px;" />

Notes:

- Opinionated model where we dictate what whoever sends a transaction needs to pay for the
  storage it creates.
- `pallet-contracts` automatically charges a deposit from the sender of a transaction if that
  transaction creates storage.
  In case that transaction removes storage the sender will get
  a refund.
  This incentivizes developers to write contracts in way that users are able
  to remove unused storage.
- This model is not as flexible as the rent model but it frees contract authors from dealing
  with the potential threat of their contracts getting purged of their storage.
- Takeaway here is that the biggest difference is that **who** is responsible for financing:
  - Storage Rent: The **contract** and hence code.
    The code could decide to make the user pay
    for storage and implement something like storage deposits, theoretically.
  - Storage Deposit: **Individual users**.
    A contract cannot change this.
    `pallet-contracts` takes
    care of this.

---

## Contracts on parachains

<img rounded src="../../../assets/img/0-Shared/parachains/relay-network-diagram.png" style="width: 700px;" />

Notes:

- `pallet-contracts` predates parachains
- It wasn't designed for being deployed in a sharded system
- When parachains arrived we needed to tackle some challenges
- This is an ongoing process with open question

---

## Execution Engine

<div class="r-stack">
  <img class="fragment current-visible" src="../img/pallet/parachains0.png" style="width: 900px;" />
  <img class="fragment current-visible" src="../img/pallet/parachains1.png" style="width: 900px;" />
</div>

Notes:

- `wasmi` used to be part of the client and offered to the runtime via a host interface
- Improving this interface would require validators to install new binary
- We were not ready to settle on this interface
- What to do?
- Moved `wasmi` into the runtime
- Roughly 50% performance hit
- Able to iterate on `wasmi` with a forkless upgrade
- We can still move the execution engine to the client later

---

## Code sizes matter!

<img rounded src="../img/pallet/val.png" style="width: 1200px;" />

Notes:

- Every parachain block is re-executed by a set of relay chain validators as part of
  the validation.
  This is necessary to learn the side effects (storage changes) of that
  block.
  Those validators do not hold any storage of the parachain hence all the required
  storage items needed for a block need to be sent to those validators along the block that
  is to be validated.
  We call that the storage proof or witness.
- If a parachain contains `pallet-contracts` then those contract executions
  (`call` extrinsics within a parachain block) also need to be re-executed by some
  relay chain validators.
  Those call extrinsics need the contract's code in order to be executed.
  This means that for every unique contract referenced by a `call` extrinsic in a parachain block
  this code needs to be send to the validator.
  This happens for every block.
  Wasm contracts tend
  to be much larger (in the range of kilobytes) than the usual storage items.
  This can make bandwidth
  a bottleneck for the throughput of transactions: Sending around contract code during validation.
- Solving this seems to be hard problem: No other blockchain has true sharding and smart contract.
- We made a lot of progress with shrinking the contract sizes that ink! produces but it is still
  an open question how to address this issue.
  In the following we look into some planned solutions:

---

## Shrink contract sizes

<img rounded src="../img/pallet/mapping.png" style="width: 1200px;" />

Notes:

- Probably the most obvious solution: Reduce the code sizes that our in-house programming language
  (ink!) produces.
  We made some great progress but we are still actively working on this.
- The main contributor to contract size is doing storage management inside the contract.
  We had some
  complex storage types that are removed now.
  We rely on a simple mapping type for now.
  More storage functionality is build into `pallet-contracts` instead of the contracts itself
  to save logic inside the contracts.
- Another contributor to contract sizes are some properties of Rust:
  - Code monomorphization
  - Passing large types by value
- Those Rust issues are largely unaddressed by now but will be taken care of eventually:
  - We will integrate optimizations into LLVM that can help with fallout of monomorphization.
  - We will refactor the code to pass large types by reference and split large generic functions
    so that only a small generic part will be duplicated by monomorphization.

---

## Prevent size regressions

<img rounded src="../img/pallet/sizes.png" style="width: 900px;" />

Notes:

- We need to make sure thats changes or new abstractions don't increase the size again
- Created CI tooling to catch regressions before a PR is merged

---

<h2 style="margin-bottom:0"> Code merkelization </h2>

<div class="r-stack" style="margin-top:0">
  <img data-fragment-index="1" class="fragment current-visible" src="../img/pallet/merkle0.png" style="width:500px; margin-top:1em" />
  <img data-fragment-index="2" class="fragment current-visible" src="../img/pallet/merkle0.png" style="width:500px; margin-top:1em" />
  <img data-fragment-index="3" class="fragment current-visible" src="../img/pallet/merkle1.png" style="width:1100px" />
  <img data-fragment-index="4" class="fragment current-visible" src="../img/pallet/merkle2.png" style="width:1100px" />
  <img data-fragment-index="5" class="fragment current-visible" src="../img/pallet/merkle3.png" style="width:1100px" />
  <img data-fragment-index="6" class="fragment current-visible" src="../img/pallet/merkle4.png" style="width:1100px" />
  <img data-fragment-index="7" class="fragment current-visible" src="../img/pallet/merkle5.png" style="width:1100px" />
</div>

<div class="r-stack">
  <p class="fragment current-visible" data-fragment-index="1">
    Many contract calls use only a small part of the code (e.g getter calls)
  </p>
  <p class="fragment current-visible" data-fragment-index="2">
    Wouldn't it be nice to only transmit parts of the contract that are actually executed?
  </p>
  <p class="fragment current-visible" data-fragment-index="3">
    On deployment merkelize the contract in-memory by using each function as a node<br/>
    Could we split on other boundaries?
  </p>
  <p class="fragment current-visible" data-fragment-index="4">
    The trie root of the contract is persisted into the main state trie
  </p>
  <p class="fragment current-visible" data-fragment-index="5">
    Block build pulls whole contract from state and tracks which functions are executed
  </p>
  <p class="fragment current-visible" data-fragment-index="6">
   Transmit witnesses to the validator
  </p>
  <p class="fragment current-visible" data-fragment-index="7">
      The validator reconstructs a wasm module that only contains executed functions from the witnesses
  </p>
</div>

Notes:

- Many contract calls only touch a small part of a contracts call (think getter functions).
  Right
  now we still need to send the whole code to the validator in this case.
- Code merkelization will store the contract's code as a trie which will allow us to send
  only the parts of a contract that where actually used by a specific contract call.
- The idea is to split the Wasm module on the function boundary.
  This will push the responsibility
  of creating useful blocks of code (i.e that minimize amount of touched functions code per `call`)
  to contract authors: It is in their interest to make their contracts cheap to execute.
- More granular units (chunks of basic blocks) while looking promising have drawbacks:
  - Tracking smaller units in the block builder incur a bigger performance overhead
  - The merkelized contract's trie will have more nodes and hence makes the witness larger
- Hard to pull of but it could yield massive speedups for certain use cases (contracts calling a lot of getters)
  It is still [in the planning phase](https://github.com/paritytech/substrate/issues/9431).

---

## Next steps / References

- Inspect the [pallet-contracts code](https://github.com/paritytech/substrate/tree/master/frame/contracts)
- Have a look at the [pallet-contracts issue board](https://github.com/paritytech/substrate/projects/6) and pick something up if you feel up for it
- Check out the supporting crates for `pallet-contracts`: [`wasm-instrument`](https://github.com/paritytech/wasm-instrument), [`wasmi`](https://github.com/paritytech/wasmi)
- [The spec](https://webassembly.github.io/spec/core/) is a good place to learn about wasm and to look up specifics

---

<!-- .slide: data-background-color="#4A2439" -->

<img rounded style="width: 300px" src="../img/ink/question-mark.svg" />