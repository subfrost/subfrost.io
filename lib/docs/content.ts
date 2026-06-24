export type DocBlock =
  | { type: "p"; text: string }
  | { type: "list"; items: string[] }
  | { type: "code"; code: string }
  | { type: "table"; rows: Array<[string, string]> }

export type DocPage = {
  slug: string
  section: string
  title: string
  description: string
  sourceUrl: string
  blocks: DocBlock[]
}

export const docSections = [
  "Introduction",
  "subfrost App",
  "Tokens",
  "Developer Guide",
  "Key Technical Components",
  "subfrost Networking",
  "Reference",
] as const

export const docPages: DocPage[] = [
  {
    slug: "introduction/overview",
    section: "Introduction",
    title: "subfrost overview",
    description: "Why subfrost exists and how synthetic BTC assets unlock Bitcoin-native DeFi.",
    sourceUrl: "https://docs.subfrost.io/",
    blocks: [
      { type: "p", text: "Bitcoin DeFi needs native BTC to power advanced applications without handing the experience to trust-heavy cross-chain substitutes. subfrost addresses that gap by issuing synthetic BTC assets that settle around Bitcoin L1." },
      { type: "p", text: "The protocol acts as decentralized custody and Layer-0 infrastructure for Bitcoin-native markets, using execution layers such as Alkanes, Arch, BRC2.0, and MIDL." },
      { type: "p", text: "The practical goal is simple: let BTC enter swaps, lending, vaults, privacy tools, and other DeFi paths while keeping the trust assumptions explicit and minimized." },
    ],
  },
  {
    slug: "introduction/technical-overview",
    section: "Introduction",
    title: "Technical overview",
    description: "The custody, proof, and network model behind subfrost.",
    sourceUrl: "https://docs.subfrost.io/introduction/technical-overview",
    blocks: [
      { type: "p", text: "subfrost operates as Layer-0 infrastructure. It uses fraud proofs expressed as ZK circuits so protocol operations can be checked independently." },
      { type: "p", text: "Custody uses FROST and ROAST threshold Schnorr signing so a signer group can collectively authorize Bitcoin transactions without a single private-key operator." },
      { type: "list", items: ["FROST and ROAST provide the threshold signature base.", "Alkanes and BRC2.0 provide programmable Bitcoin execution surfaces.", "QUIC and libp2p carry peer-to-peer communication between protocol components."] },
    ],
  },
  {
    slug: "introduction/api-docs",
    section: "Introduction",
    title: "API docs",
    description: "Entry points for Bitcoin-native application development.",
    sourceUrl: "https://docs.subfrost.io/introduction/subfrost-api-docs",
    blocks: [
      { type: "p", text: "The API docs are the developer entry point for app builders that need balances, wrapping state, transaction data, or integration paths around Bitcoin-native assets." },
      { type: "p", text: "The external API reference remains available while this repo takes ownership of the designed docs experience." },
      { type: "list", items: ["Use these docs for product-level integration context.", "Use the API reference for exact endpoint contracts.", "Keep source-of-truth endpoint behavior in the API service."] },
    ],
  },
  {
    slug: "app/overview",
    section: "subfrost App",
    title: "App overview",
    description: "The product surface for swaps, vaults, futures, and wallet flows on Bitcoin.",
    sourceUrl: "https://docs.subfrost.io/subfrost-app/overview",
    blocks: [
      { type: "p", text: "The subfrost app is designed to make Bitcoin DeFi feel as direct as the best Solana and Ethereum apps while settling activity around Bitcoin L1." },
      { type: "list", items: ["Swap between native BTC and supported assets.", "Deposit into Bitcoin-native yield vaults.", "Trade time-locked BTC positions.", "Use SegWit, Taproot, browser-extension, and self-custodial wallet paths."] },
      { type: "p", text: "The design principle is native BTC first: wrapping, routing, and settlement complexity should move behind the interface instead of becoming user work." },
    ],
  },
  {
    slug: "app/swap",
    section: "subfrost App",
    title: "BTCFi swap",
    description: "Single-transaction trading settled around Bitcoin L1.",
    sourceUrl: "https://docs.subfrost.io/subfrost-app/swap/",
    blocks: [
      { type: "p", text: "Swap lets users trade between supported BTCFi assets without manually managing bridge or wrapped-token steps." },
      { type: "list", items: ["Single-transaction swaps.", "Automatic routing for better rates.", "Support for Alkanes, BRC20s, stablecoins, SOL, ZEC, and native BTC paths.", "Direct swap routes to and from native BTC."] },
    ],
  },
  {
    slug: "app/vaults",
    section: "subfrost App",
    title: "DeFi vaults on Bitcoin",
    description: "Automated yield strategies for BTC and supported tokens.",
    sourceUrl: "https://docs.subfrost.io/subfrost-app/vaults/",
    blocks: [
      { type: "p", text: "Vaults automate yield work that users should not have to run manually: LP deployment, reward harvesting, rebalancing, and compounding." },
      { type: "list", items: ["FIRE for DIESEL/frBTC LP staking.", "dxBTC for BTC and frBTC yield.", "veUSD for USD/BTC LP yield."] },
      { type: "p", text: "The product goal is Bitcoin yield without forcing users to become strategy operators." },
    ],
  },
  {
    slug: "app/futures",
    section: "subfrost App",
    title: "Bitcoin futures",
    description: "Time-locked BTC positions with deterministic redemption mechanics.",
    sourceUrl: "https://docs.subfrost.io/subfrost-app/futures/",
    blocks: [
      { type: "p", text: "ftrBTC represents a time-locked BTC position. Holders can wait until expiry for full redemption or exercise early by paying a premium that declines over time." },
      { type: "table", rows: [["Lock range", "1 to 95 blocks"], ["At expiry", "1 ftrBTC redeems for 1 BTC"], ["Early exercise", "Premium starts higher and trends toward zero"]] },
    ],
  },
  {
    slug: "app/wallet",
    section: "subfrost App",
    title: "Wallet",
    description: "Self-custodial Bitcoin access for app flows.",
    sourceUrl: "https://docs.subfrost.io/subfrost-app/wallet/",
    blocks: [
      { type: "p", text: "The wallet surface supports SegWit and Taproot paths from browser extensions such as Xverse and OKX, plus a built-in self-custodial keystore option." },
      { type: "list", items: ["Connect popular Bitcoin wallets.", "Create or restore an app keystore.", "Route balances into swaps, vaults, and futures without losing self-custody."] },
    ],
  },
  {
    slug: "tokens/frbtc",
    section: "Tokens",
    title: "frBTC",
    description: "The Bitcoin DeFi-compatible BTC asset pegged 1:1 to native BTC.",
    sourceUrl: "https://docs.subfrost.io/tokens/frBTC-overview",
    blocks: [
      { type: "p", text: "frBTC is designed as interoperable wrapped BTC for Bitcoin L1 DeFi ecosystems. Users lock native BTC and receive an equivalent synthetic asset for programmable Bitcoin markets." },
      { type: "p", text: "The intended user experience is one signature into advanced Bitcoin DeFi. The app can abstract wrapping, execute the target action, and keep the user focused on the desired outcome." },
      { type: "list", items: ["Live target surfaces include Alkanes and BRC2.0.", "Arch and MIDL integrations are part of the expansion path.", "The core peg model is 1:1 with native BTC."] },
    ],
  },
  {
    slug: "tokens/frbtc-roadmap",
    section: "Tokens",
    title: "frBTC roadmap",
    description: "Expansion path for frBTC across programmable Bitcoin ecosystems.",
    sourceUrl: "https://docs.subfrost.io/tokens/frbtc-roadmap",
    blocks: [
      { type: "p", text: "frBTC expansion follows the growth of programmable Bitcoin execution. The priority is to make native BTC usable wherever credible Bitcoin L1 DeFi liquidity forms." },
      { type: "list", items: ["Alkanes support anchors the initial programmable token path.", "BRC2.0 support brings EVM-compatible execution to Bitcoin inscriptions.", "Arch and MIDL are planned expansion targets."] },
    ],
  },
  {
    slug: "tokens/dxbtc",
    section: "Tokens",
    title: "dxBTC",
    description: "Yield-bearing BTC built on top of frBTC strategy deployment.",
    sourceUrl: "https://docs.subfrost.io/tokens/dxBTC-overview/",
    blocks: [
      { type: "p", text: "dxBTC represents staked BTC deployed into conservative yield strategies through subfrost governance. The asset is designed to let BTC holders earn BTC-denominated yield without selling their exposure." },
      { type: "list", items: ["User stakes BTC and receives dxBTC.", "BTC is wrapped to frBTC.", "frBTC is deployed into market-neutral LP or overcollateralized lending paths.", "Yield is returned to stakers in native BTC terms."] },
    ],
  },
  {
    slug: "tokens/fuel",
    section: "Tokens",
    title: "FUEL token",
    description: "Governance and utility around subfrost fee flow and strategy selection.",
    sourceUrl: "https://docs.subfrost.io/tokens/FUEL-token",
    blocks: [
      { type: "p", text: "FUEL is the governance and utility token for the protocol. Public tokenomics remain staged, but the intended utility centers on strategy governance, fee policy, and protocol upgrades." },
      { type: "list", items: ["Manage dxBTC treasury strategy.", "Vote on wrap, unwrap, and protocol fees.", "Govern upgrades to protocol components.", "Capture value from protocol economic activity."] },
    ],
  },
  {
    slug: "developer/alkanes-integration",
    section: "Developer Guide",
    title: "Alkanes integration",
    description: "CLI workflow for wallets, token operations, contracts, and Bitcoin RPC access.",
    sourceUrl: "https://docs.subfrost.io/developer-guide/alkanes-integration",
    blocks: [
      { type: "p", text: "The Alkanes CLI is the primary tool for interacting with Alkanes on Bitcoin. It handles wallet creation, balance queries, wrapping, unwrapping, custom execution, simulation, and network calls." },
      { type: "code", code: "git clone https://github.com/kungfuflex/alkanes-rs\ncd alkanes-rs\ncargo build --release" },
      { type: "code", code: "alkanes wallet create\nalkanes wallet addresses --range 0:5\nalkanes wallet balance" },
      { type: "code", code: "alkanes alkanes wrap-btc 0.01 \\\n  --to bc1p... \\\n  --from bc1q... \\\n  --change bc1q... \\\n  --fee-rate 10 \\\n  -y" },
    ],
  },
  {
    slug: "developer/frbtc-alkanes",
    section: "Developer Guide",
    title: "frBTC on Alkanes",
    description: "Wrapping, unwrapping, and contract interaction through the Alkanes metaprotocol.",
    sourceUrl: "https://docs.subfrost.io/developer-guide/wrapping-frBTC/",
    blocks: [
      { type: "p", text: "The frBTC Alkane contract validates BTC sent to the correct signer address and mints equivalent frBTC to the requested recipient." },
      { type: "table", rows: [["Alkane ID", "{32, 0}"], ["Wrap opcode", "77"], ["Unwrap opcode", "78"], ["Get signer opcode", "103"]] },
      { type: "p", text: "Unwrapping is a two-step flow: burn frBTC through the contract, then release native BTC to the requested Bitcoin destination after signer validation." },
    ],
  },
  {
    slug: "developer/brc20-integration",
    section: "Developer Guide",
    title: "BRC2.0 integration",
    description: "Using ord inscriptions and EVM-compatible bytecode for Bitcoin execution.",
    sourceUrl: "https://docs.subfrost.io/developer-guide/brc20-prog/",
    blocks: [
      { type: "p", text: "BRC2.0 uses standard ord inscriptions with JSON payloads to deploy and call EVM-compatible contracts on Bitcoin." },
      { type: "list", items: ["Install Rust, Cargo, Bitcoin Core access, Foundry, and alkanes-rs.", "Compile Solidity with Foundry.", "Use commit, reveal, and activation transactions to publish or call contracts."] },
      { type: "code", code: "curl -L https://foundry.paradigm.xyz | bash\nfoundryup\nforge --version" },
    ],
  },
  {
    slug: "developer/frbtc-brc20",
    section: "Developer Guide",
    title: "FR-BTC on BRC2.0",
    description: "Atomic wrap and execute flows for composable BRC2.0 applications.",
    sourceUrl: "https://docs.subfrost.io/developer-guide/frBTC-brc20/",
    blocks: [
      { type: "p", text: "FR-BTC exposes wrap flows that can also execute custom BRC2.0 logic. If the custom script fails, the user still receives FR-BTC safely." },
      { type: "list", items: ["wrap() converts BTC into FR-BTC.", "wrapAndExecute deploys and runs a script.", "wrapAndExecute2 accepts custom calldata for a richer execution path."] },
      { type: "table", rows: [["BRC2.0 mainnet", "0xdBB5b6A1D422fca2813cF486e5F986ADB09D8337"], ["BRC2.0 signet", "0x1EB63D0d0e5A86146B4E1Cebc79b1d6e35093288"]] },
    ],
  },
  {
    slug: "key-components/alkanes",
    section: "Key Technical Components",
    title: "Alkanes protocol",
    description: "Stateful Bitcoin applications through OP_RETURN protocol messages.",
    sourceUrl: "https://docs.subfrost.io/key-components/alkanes",
    blocks: [
      { type: "p", text: "Alkanes enables smart-contract-like state transitions on Bitcoin. It powers synthetic assets such as frBTC and lets subfrost verify complex token logic against Bitcoin transaction data." },
      { type: "p", text: "Runestones embed metaprotocol instructions into OP_RETURN outputs. Indexers read those outputs and apply state changes to the Alkanes state database." },
      { type: "list", items: ["protocolTag identifies the metaprotocol.", "edicts define balance changes.", "pointer assigns unallocated runes.", "calldata calls contract logic."] },
    ],
  },
  {
    slug: "key-components/brc20",
    section: "Key Technical Components",
    title: "BRC2.0 protocol",
    description: "EVM-compatible smart contracts deployed through Bitcoin inscriptions.",
    sourceUrl: "https://docs.subfrost.io/key-components/brc20-prog/",
    blocks: [
      { type: "p", text: "BRC2.0, also called brc20-prog, deploys and executes EVM-compatible contracts directly on Bitcoin through inscription payloads." },
      { type: "list", items: ["Deploy payloads contain compiled EVM bytecode.", "Call payloads contain target contract addresses and ABI-encoded calldata.", "Commit-reveal-activation reduces front-running and preserves deterministic deployment."] },
      { type: "p", text: "Contract addresses use the Ethereum-style keccak and RLP derivation, which lets developers predict addresses before deployment." },
    ],
  },
  {
    slug: "key-components/frost-roast",
    section: "Key Technical Components",
    title: "FROST and ROAST",
    description: "Threshold Schnorr signing for decentralized custody.",
    sourceUrl: "https://docs.subfrost.io/key-components/frost-roast/",
    blocks: [
      { type: "p", text: "FROST is a threshold Schnorr scheme that lets multiple participants generate a single group signature. ROAST adds robustness so signing can complete even when some participants are offline or adversarial." },
      { type: "list", items: ["No single custodian holds the full signing key.", "Partial signatures combine into one valid Schnorr signature.", "The model supports large signer groups and fault tolerance."] },
    ],
  },
  {
    slug: "key-components/schnorr",
    section: "Key Technical Components",
    title: "Schnorr signatures",
    description: "The linear signature primitive behind FROST and Taproot-era Bitcoin custody.",
    sourceUrl: "https://docs.subfrost.io/key-components/schnorr-signatures/",
    blocks: [
      { type: "p", text: "Schnorr signatures are simple, compact, and linear. Linearity lets multiple partial signatures aggregate into one valid signature, which is why threshold schemes such as FROST can work." },
      { type: "list", items: ["Smaller than typical ECDSA signatures.", "Provably secure under standard assumptions.", "Native to Bitcoin's Taproot-era signing model."] },
    ],
  },
  {
    slug: "key-components/keystore",
    section: "Key Technical Components",
    title: "Keystore management",
    description: "How signer material and wallet secrets should be handled.",
    sourceUrl: "https://docs.subfrost.io/key-components/keystore-management/",
    blocks: [
      { type: "p", text: "Keystore management protects the private material used by users and protocol participants. The operating rule is least exposure: secrets should be encrypted, locally scoped, and never moved unnecessarily." },
      { type: "list", items: ["Encrypt key material at rest.", "Keep signing operations explicit.", "Separate watch-only state from spend authority.", "Treat mnemonic and private-key recovery flows as high-risk surfaces."] },
    ],
  },
  {
    slug: "key-components/proof-of-stake",
    section: "Key Technical Components",
    title: "subfrost proof-of-stake",
    description: "Stake, incentives, and protocol governance around signer behavior.",
    sourceUrl: "https://docs.subfrost.io/key-components/subfrost-proof-of-stake/",
    blocks: [
      { type: "p", text: "Proof-of-stake aligns signer and governance incentives around protocol safety. The model should make bad behavior expensive and honest participation economically rational." },
      { type: "list", items: ["Stake backs protocol participation.", "Governance controls strategy and upgrade decisions.", "Fee flow and token incentives should reinforce reliable service."] },
    ],
  },
  {
    slug: "networking/subp2p",
    section: "subfrost Networking",
    title: "Introduction to subp2p",
    description: "The peer-to-peer networking base for subfrost services.",
    sourceUrl: "https://docs.subfrost.io/subfrost-networking/introduction-to-subp2p",
    blocks: [
      { type: "p", text: "subp2p is the peer-to-peer networking layer for subfrost components. It builds on libp2p and combines discovery, secure transport, stream multiplexing, and protocol negotiation." },
      { type: "list", items: ["TCP, QUIC, and WebTransport support.", "mDNS and Kademlia DHT peer discovery.", "Noise-encrypted authenticated sessions.", "NAT traversal through AutoNAT, DCUtR, and circuit relay."] },
    ],
  },
  {
    slug: "networking/subrelay",
    section: "subfrost Networking",
    title: "subrelay",
    description: "Rendezvous, relay, and naming services for subp2p nodes.",
    sourceUrl: "https://docs.subfrost.io/subfrost-networking/subrelay/",
    blocks: [
      { type: "p", text: "subrelay helps nodes find and reach each other even behind restrictive firewalls or NATs. It functions as a rendezvous point, traffic relay, and name registrar." },
      { type: "list", items: ["Register reachable service names.", "Relay streams when direct connectivity fails.", "Improve peer discovery across hostile network conditions."] },
    ],
  },
  {
    slug: "networking/subproxy",
    section: "subfrost Networking",
    title: "subproxy",
    description: "Bridge between subp2p services and the traditional internet.",
    sourceUrl: "https://docs.subfrost.io/subfrost-networking/subproxy",
    blocks: [
      { type: "p", text: "subproxy connects applications on the regular internet with services running on subp2p. It can run as a SOCKS5 proxy or as a reverse proxy." },
      { type: "list", items: ["Let standard apps reach subp2p services.", "Expose local services into the p2p network.", "Bridge browser, server, and node traffic without rewriting every app."] },
    ],
  },
  {
    slug: "networking/subtun",
    section: "subfrost Networking",
    title: "subtun",
    description: "Peer-to-peer VPN tunnels over subp2p.",
    sourceUrl: "https://docs.subfrost.io/subfrost-networking/subtun/",
    blocks: [
      { type: "p", text: "subtun creates secure peer-to-peer VPN links by reading packets from a TUN interface, encapsulating them, and sending them over encrypted subp2p streams." },
      { type: "list", items: ["Gateway mode accepts multiple client connections.", "Client mode joins the virtual network.", "Topologies can range from point-to-point tunnels to hub-and-spoke networks."] },
    ],
  },
  {
    slug: "networking/gossipsub",
    section: "subfrost Networking",
    title: "Gossipsub and encrypted communication",
    description: "Pub/sub messaging over authenticated peer-to-peer channels.",
    sourceUrl: "https://docs.subfrost.io/subfrost-networking/gossipsub-encrypted-communication/",
    blocks: [
      { type: "p", text: "Gossipsub provides topic-based pub/sub messaging for subfrost services. Messages travel over encrypted and authenticated peer connections." },
      { type: "list", items: ["Publish events to named topics.", "Subscribe services to protocol updates.", "Use encryption and peer identity to reduce spoofing risk."] },
    ],
  },
  {
    slug: "networking/microservices",
    section: "subfrost Networking",
    title: "Building microservices on subp2p",
    description: "A decentralized service architecture using subp2p, subrelay, subproxy, and subtun.",
    sourceUrl: "https://docs.subfrost.io/subfrost-networking/building-microservices-on-subp2p",
    blocks: [
      { type: "p", text: "subp2p can support fleets of small services that communicate over secure peer-to-peer links instead of assuming every component lives behind one centralized network perimeter." },
      { type: "list", items: ["subp2p provides communication.", "subrelay provides discovery and relay.", "subproxy bridges traditional internet clients.", "subtun creates private service networks."] },
    ],
  },
  {
    slug: "reference/subfrost-node-cli",
    section: "Reference",
    title: "subfrost-node CLI",
    description: "Operational command reference for node configuration and service control.",
    sourceUrl: "https://docs.subfrost.io/reference/subfrost-node-cli-reference/",
    blocks: [
      { type: "p", text: "The node CLI reference covers service startup, configuration, network participation, and operational diagnostics for subfrost infrastructure." },
      { type: "code", code: "subfrost-node --help\nsubfrost-node start\nsubfrost-node status" },
      { type: "p", text: "Use the CLI reference when operating protocol services or building automation around subfrost node lifecycle events." },
    ],
  },
]

export const docsBySlug = new Map(docPages.map((page) => [page.slug, page]))

export function docsForSection(section: string) {
  return docPages.filter((page) => page.section === section)
}

export function localDocHref(slug: string) {
  return `/docs/${slug}`
}
