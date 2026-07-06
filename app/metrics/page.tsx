import type { Metadata } from "next"
import { EditorialShell } from "@/components/articles/EditorialShell"
import { MetricCard } from "@/components/data/DataPageClient"
import { OpReturnCharts } from "@/components/data/OpReturnCharts"
import { getPublicData, formatMetricValue, type PublicMetricKey } from "@/lib/marketing/public-data"
import { getPublicOpReturnData } from "@/lib/marketing/public-opreturn"
import { absoluteUrl } from "@/lib/seo"

export const dynamic = "force-dynamic"

type Locale = "en" | "zh"

const copy = {
  en: {
    title: "SUBFROST protocol data",
    subtitle: "Live metrics of the SUBFROST protocol on Bitcoin — updated daily, straight from the chain.",
    heroLabel: "BTC locked",
    heroSub: "frBTC supply",
    building: "History building since",
    updated: "Last updated",
    card: { share: "Copy card link", copied: "Copied!", post: "Post on X", sevenDays: "7d" },
    opreturn: {
      title: "Alkanes on-chain activity",
      note: "Sampled data from our open-source OP_RETURN scanner. An exact full-chain engine is in the works.",
      noteLink: "View the scanner and raw data on GitHub.",
      reproduce: "Reproduce it yourself — the whole pipeline is open source (MIT):",
      reproduceData: "daily data & figure generator",
      updated: "Data through",
      subHeader: "{firstDate} – {lastDate} · {days} days · {totalTx} transactions sampled · updated daily",
      windowAll: "All time",
      window60: "60 days",
      windowYtd: "This year",
      legendTip: "Tip: click a legend item to show/hide its line.",
      howTitle: "How it's calculated",
      how: [
        "The scanner reads every sampled Bitcoin block in the window and inspects each transaction's outputs. An output whose script starts with 6a is an OP_RETURN; one starting 6a5d is a Runestone.",
        "It decodes the Runestone, and if any protostone carries protocol_tag = 1, the transaction is Alkanes. A DIESEL mint is the specific case where the cellpack targets 2:0 with opcode 77 (the genesis alkane) — today that's the vast majority of all Alkanes activity.",
        "Share of transactions = matching tx ÷ all tx. Share of OP_RETURN bytes = Alkanes OP_RETURN bytes ÷ all OP_RETURN bytes. Shares are unaffected by sampling; each day rests on dozens of sampled blocks. Classification reuses the open-source alkanes-opreturn-decoder.",
        "Glossary. OP_RETURN penetration: share of all BTC tx that carry an OP_RETURN. Alkanes (tx): share of all BTC tx that are Alkanes. Alkanes (bytes): share of OP_RETURN bytes that are Alkanes. Runes (non-Alkanes): OP_RETURN bytes that are Runestones but not Alkanes. Alkanes excl. DIESEL: Alkanes tx that aren't DIESEL mints — \"real app\" usage. DIESEL: mint of the genesis alkane (cellpack 2:0 op 77). Alkanes of OP_RETURN: of tx that carry an OP_RETURN, the share that are Alkanes (by tx and by bytes). Bytes per tx: average OP_RETURN script size per transaction in each bucket. Alkanes share of fee revenue: Alkanes fees ÷ total fees (subsidy excluded).",
      ],
      charts: {
        dailyShare: {
          title: "Daily Alkanes share",
          series: { txShare: "Transactions", opReturnPenetration: "OP_RETURN penetration" },
          desc: "How much of Bitcoin's daily transaction volume is Alkanes, alongside how much of all Bitcoin transactions carry an OP_RETURN at all — Alkanes activity tracks the broader OP_RETURN trend closely.",
        },
        opReturnShare: {
          title: "Alkanes' share of OP_RETURN",
          series: { txPct: "% of OP_RETURN transactions", bytesPct: "% of OP_RETURN bytes" },
          desc: "Of every Bitcoin transaction that carries an OP_RETURN, {txPct30} are Alkanes (last 30 days), and they account for {bytesPct30} of all OP_RETURN data bytes. This is Alkanes' grip on OP_RETURN itself — independent of how many BTC tx use OP_RETURN at all.",
        },
        latestDonut: {
          title: "Last day — share of OP_RETURN transactions",
          series: { alkanes: "Alkanes", other: "Other OP_RETURN" },
          desc: "How this is calculated. Last day = {lastDate} (Bitcoin blocks {fromHeight}–{toHeight}, {blocks} sampled). Of {opRetTx} transactions carrying an OP_RETURN that day, {alkTx} were Alkanes → {pct}. Share = Alkanes OP_RETURN tx ÷ all OP_RETURN tx. A transaction counts as Alkanes when one of its OP_RETURN outputs decodes as a Runestone whose protostone carries protocol_tag = 1.",
        },
        weightShare: {
          title: "Alkanes' share of block space (by weight)",
          desc: "This is the literal block space Alkanes occupy — transaction weight, the unit Bitcoin's block limit is actually denominated in (not byte counts, not transaction counts). Alkanes were {weightShareFull} of all block weight over the period and {weightShareLatest} on the last measured day. This is the honest \"how much of Bitcoin is Alkanes\" answer: by weight they are still a minority of block space, far below their share of transaction count (most Alkanes tx are tiny DIESEL mints). Measured directly from each transaction's weight via a metashrew/alkanes-rs indexer.",
        },
        dieselTxShare: {
          title: "DIESEL mints — share of all Bitcoin transactions",
          desc: "DIESEL, the genesis alkane, is minted directly on Bitcoin — this tracks how much of all Bitcoin transaction volume is DIESEL mints on their own, separate from other Alkanes activity.",
        },
        ugDieselShare: {
          title: "UNCOMMON•GOODS mints that are DIESEL",
          desc: "UNCOMMON•GOODS (Rune 1:0) rides along on almost every DIESEL mint. Of all UNCOMMON•GOODS mints each day, the share that are also DIESEL climbed from {ugShareEarly} early on to {ugShareRecent} recently ({ugShareFull} over the whole period): when you see an UNCOMMON•GOODS mint today, it is almost always DIESEL \"wearing Runes clothing.\" Detected as a runestone whose mint is Rune 1:0 on a DIESEL (cellpack 2:0 op 77) transaction.",
        },
        bytesDonut: {
          title: "OP_RETURN bytes (since DIESEL genesis)",
          series: { alkanes: "Alkanes", runes: "Runes (non-Alkanes)", other: "Other" },
          desc: "Of all OP_RETURN data written to Bitcoin since the DIESEL genesis block (880,000, Jan 20 2025), the share that is Alkanes, non-Alkanes Runes, and everything else — measured in bytes, not transaction count.",
        },
        bytesPerTx: {
          title: "OP_RETURN bytes per transaction",
          series: { alkanes: "Alkanes", rest: "Other OP_RETURN" },
          desc: "Alkanes' OP_RETURN payload is small and stable ({bytesPerTx} bytes/tx), while the rest of OP_RETURN traffic is larger and more volatile — Alkanes are byte-efficient on-chain. (Bytes = full OP_RETURN output script.)",
        },
        minerRevenueUsd: {
          title: "Miner fee revenue",
          desc: "Daily revenue extrapolates the sampled blocks to a full day and adds the 3.125 BTC/block subsidy, converted to USD at that day's BTC price. The USD swings here are mostly the BTC price — the activity-driven part of miner income is the fees, shown next in BTC.",
        },
        feesSplitBtc: {
          title: "Miner fee revenue from fees (BTC) — Alkanes vs rest",
          series: { alkanes: "Alkanes fees", rest: "Other fees" },
          desc: "The block subsidy is a fixed 3.125 BTC/block, so the part of miner income that grows with on-chain activity is the fees. This shows daily fees in BTC, split into what Alkanes transactions paid vs everything else — so you can see Alkanes' real contribution to miners' BTC earnings as Alkanes activity grows. Subsidy excluded.",
        },
        alkanesFeeShare: {
          title: "Alkanes' share of miner fee revenue",
          desc: "By fee revenue — what miners actually earn from fees — Alkanes are {feeShare30} over the last 30 days ({feeShareFull} over the full tracked period), far below their share of transaction count, because most Alkanes tx are tiny DIESEL mints that pay little. All OP_RETURN traffic together pays {opRetFeeShare30} of fee revenue over the same 30 days ({opRetFeeShareFull} full period). (Subsidy excluded here; fees only.)",
        },
        fourAnswers: {
          title: "How much of Bitcoin is Alkanes? Four answers",
          series: { byTx: "By transaction count", byBytes: "By OP_RETURN bytes", byWeight: "By block weight", byFee: "By miner fee revenue" },
          desc: "The same question answered four ways, overlaid: Alkanes' share of Bitcoin by transaction count, by OP_RETURN data bytes, by block weight, and by miner fee revenue. By count Alkanes loom large (mostly tiny DIESEL mints); by weight and by fees they are a much smaller slice — the honest answer depends on the yardstick.",
        },
        dieselMintsPerDay: {
          title: "DIESEL mints per day — the birth curve",
          desc: "DIESEL was born at block 880,000 on Jan 20 2025. This is the raw volume — estimated mints per day (sampled blocks × 144) — on a log scale so the early days stay visible: from a handful a day in early 2025 to a peak around 551,346/day. The take-off in Aug–Sep 2025 is when DIESEL minting exploded (and began riding UNCOMMON•GOODS).",
        },
        dieselCumulative: {
          title: "DIESEL minted — cumulative since genesis",
          desc: "The running total of estimated DIESEL mints since genesis (block 880,000, Jan 20 2025) — the sum of the daily birth curve above. The curve steepens through 2025 as minting accelerated.",
        },
        feePerTx: {
          title: "Fee per transaction — Alkanes vs everyone else",
          series: { alkanes: "Alkanes tx", rest: "Non-Alkanes tx" },
          desc: "Average fee paid per transaction, in sats, split between Alkanes transactions and everyone else. Alkanes tx are mostly small DIESEL mints that pay modest fees, so per transaction they typically sit below the rest of Bitcoin's traffic — the mirror image of their share by transaction count. (Per-day fees ÷ tx count in each bucket; subsidy excluded.)",
        },
        ugMintsPerDay: {
          title: "UNCOMMON•GOODS mints per day — taken over by DIESEL",
          series: { diesel: "DIESEL", independent: "Independent Runes" },
          desc: "Almost every DIESEL mint also mints UNCOMMON•GOODS (Rune 1:0). This splits daily UNCOMMON•GOODS mints into the DIESEL-driven ones vs genuinely independent Runes — DIESEL has come to dominate the count. (Raw counts in the sampled blocks.)",
        },
        runesVsAlkanesShare: {
          title: "Runes (non-Alkanes) vs Alkanes — share of OP_RETURN bytes",
          series: { alkanes: "Alkanes", pureRunes: "Runes (non-Alkanes)" },
          desc: "Of all OP_RETURN data bytes, the share written by Alkanes vs by Runes that are not Alkanes (Runestones without an Alkanes protostone). Alkanes have overtaken Runes on Bitcoin's OP_RETURN byte budget.",
        },
        runesVsAlkanesBytes: {
          title: "Runes (non-Alkanes) vs Alkanes — absolute bytes per day",
          series: { alkanes: "Alkanes", pureRunes: "Runes (non-Alkanes)" },
          desc: "The same comparison in absolute terms — estimated OP_RETURN bytes per day (sampled blocks × 144) for Alkanes vs non-Alkanes Runes, on a log scale so both early and recent volumes stay readable.",
        },
        byteComposition: {
          title: "OP_RETURN byte composition over time",
          series: { alkanes: "Alkanes", pureRunes: "Runes (non-Alkanes)", other: "Other" },
          desc: "How the OP_RETURN byte budget splits between Alkanes, non-Alkanes Runes and everything else, day by day — the moving version of the since-genesis donut above.",
        },
        runestoneTxShare: {
          title: "Runestone transactions — Alkanes vs Runes (non-Alkanes)",
          series: { alkanes: "Alkanes", pureRunes: "Runes (non-Alkanes)" },
          desc: "Of every transaction that carries a Runestone, the share that is Alkanes (a protostone with protocol_tag = 1) vs Runes (non-Alkanes) — a Runestone with no Alkanes protostone. Runes owned this at genesis; today Alkanes are the overwhelming majority of Runestone transactions.",
        },
        runestoneTxCount: {
          title: "Runestone transactions per day — Alkanes vs Runes (non-Alkanes)",
          series: { alkanes: "Alkanes", pureRunes: "Runes (non-Alkanes)" },
          desc: "The same split in absolute terms — estimated Runestone transactions per day (sampled blocks scaled to a full 144-block day), on a log scale so both the early Runes-dominated days and today's Alkanes volume stay readable.",
        },
      },
    },
  },
  zh: {
    title: "SUBFROST 协议数据",
    subtitle: "SUBFROST 比特币协议的实时指标——每日更新，直接来自链上。",
    heroLabel: "锁定的 BTC",
    heroSub: "frBTC 供应量",
    building: "历史数据积累开始于",
    updated: "最近更新",
    card: { share: "复制卡片链接", copied: "已复制!", post: "发布到 X", sevenDays: "7天" },
    opreturn: {
      title: "Alkanes 链上活动",
      note: "数据来自我们开源的 OP_RETURN 扫描器（抽样统计）。精确的全链引擎正在开发中。",
      noteLink: "在 GitHub 查看扫描器与原始数据。",
      reproduce: "想自己复现这些数字？整条管线全部开源（MIT）：",
      reproduceData: "每日数据与图表生成器",
      updated: "数据截至",
      subHeader: "{firstDate} – {lastDate} · {days} 天 · 抽样 {totalTx} 笔交易 · 每日更新",
      windowAll: "全部",
      window60: "60 天",
      windowYtd: "今年",
      legendTip: "提示：点击图例可显示/隐藏对应线条。",
      howTitle: "计算方式",
      how: [
        "扫描器读取窗口期内每个抽样的比特币区块，并检查每笔交易的输出。以 6a 开头的输出脚本是 OP_RETURN；以 6a5d 开头的则是符文石（Runestone）。",
        "扫描器解码符文石，若任一 protostone 携带 protocol_tag = 1，该交易即为 Alkanes。DIESEL 铸造是特殊情形：cellpack 指向 2:0、操作码为 77（创世 alkane）——如今这占 Alkanes 全部活动的绝大多数。",
        "交易份额 = 符合条件的交易数 ÷ 全部交易数。OP_RETURN 字节份额 = Alkanes 的 OP_RETURN 字节数 ÷ 全部 OP_RETURN 字节数。份额不受抽样影响；每天基于数十个抽样区块计算。分类复用开源的 alkanes-opreturn-decoder。",
        "术语表。OP_RETURN 渗透率：携带 OP_RETURN 的全部比特币交易占比。Alkanes（交易）：全部比特币交易中属于 Alkanes 的占比。Alkanes（字节）：OP_RETURN 字节中属于 Alkanes 的占比。Runes（非 Alkanes）：属于符文石但非 Alkanes 的 OP_RETURN 字节。Alkanes 不含 DIESEL：非 DIESEL 铸造的 Alkanes 交易——即「真实应用」使用量。DIESEL：创世 alkane 的铸造（cellpack 2:0 操作码 77）。OP_RETURN 中的 Alkanes 占比：在携带 OP_RETURN 的交易中，属于 Alkanes 的份额（按交易数与按字节数）。每笔交易字节数：各类别中每笔交易的平均 OP_RETURN 脚本大小。Alkanes 手续费份额：Alkanes 手续费 ÷ 总手续费（不含区块补贴）。",
      ],
      charts: {
        dailyShare: {
          title: "每日 Alkanes 份额",
          series: { txShare: "交易笔数", opReturnPenetration: "OP_RETURN 渗透率" },
          desc: "比特币每日交易量中有多少是 Alkanes，以及全部比特币交易中携带 OP_RETURN 的比例——Alkanes 活动与整体 OP_RETURN 趋势高度同步。",
        },
        opReturnShare: {
          title: "Alkanes 占 OP_RETURN 的份额",
          series: { txPct: "占 OP_RETURN 交易的比例", bytesPct: "占 OP_RETURN 字节的比例" },
          desc: "在每一笔携带 OP_RETURN 的比特币交易中，{txPct30} 是 Alkanes（最近 30 天），它们占全部 OP_RETURN 数据字节的 {bytesPct30}。这反映了 Alkanes 对 OP_RETURN 本身的占有率——与使用 OP_RETURN 的比特币交易总量无关。",
        },
        latestDonut: {
          title: "最新一天 — OP_RETURN 交易份额",
          series: { alkanes: "Alkanes", other: "其他 OP_RETURN" },
          desc: "计算方式。最新一天 = {lastDate}（比特币区块 {fromHeight}–{toHeight}，抽样 {blocks} 个）。当天携带 OP_RETURN 的 {opRetTx} 笔交易中，{alkTx} 笔为 Alkanes → {pct}。份额 = Alkanes 的 OP_RETURN 交易 ÷ 全部 OP_RETURN 交易。当一笔交易的某个 OP_RETURN 输出解码为携带 protocol_tag = 1 的符文石 protostone 时，即计为 Alkanes。",
        },
        weightShare: {
          title: "Alkanes 占区块空间的份额（按 weight 计）",
          desc: "这是 Alkanes 实际占用的区块空间——交易 weight，也就是比特币区块上限真正以之计量的单位（不是字节数，也不是交易笔数）。在整个统计期内，Alkanes 占全部区块 weight 的 {weightShareFull}，在最新测量日为 {weightShareLatest}。这才是「Alkanes 到底占比特币多少」的诚实答案：按 weight 计算，它们仍是区块空间中的少数，远低于其交易笔数占比（因为大多数 Alkanes 交易都是极小的 DIESEL 铸造）。数据直接来自每笔交易的 weight，经由 metashrew/alkanes-rs 索引器测量得出。",
        },
        dieselTxShare: {
          title: "DIESEL 铸造 — 占全部比特币交易的份额",
          desc: "DIESEL（创世 alkane）直接在比特币上铸造——这条曲线单独展示 DIESEL 铸造占全部比特币交易量的比例，与其他 Alkanes 活动分开统计。",
        },
        ugDieselShare: {
          title: "UNCOMMON•GOODS 铸造中属于 DIESEL 的比例",
          desc: "UNCOMMON•GOODS（符文 1:0）几乎搭乘在每一笔 DIESEL 铸造上。在每天全部 UNCOMMON•GOODS 铸造中，同时也是 DIESEL 的比例从早期的 {ugShareEarly} 攀升到近期的 {ugShareRecent}（整个统计期为 {ugShareFull}）：如今你看到的 UNCOMMON•GOODS 铸造，几乎都是「披着 Runes 外衣」的 DIESEL。判定方式：符文石的铸造目标为符文 1:0，且所在交易同时是 DIESEL（cellpack 2:0 操作码 77）。",
        },
        bytesDonut: {
          title: "OP_RETURN 字节数（自 DIESEL 创世以来）",
          series: { alkanes: "Alkanes", runes: "Runes（非 Alkanes）", other: "其他" },
          desc: "自 DIESEL 创世区块（880,000，2025 年 1 月 20 日）以来写入比特币的全部 OP_RETURN 数据中，Alkanes、非 Alkanes 的 Runes 与其他用途各自占比——按字节而非交易笔数衡量。",
        },
        bytesPerTx: {
          title: "每笔交易的 OP_RETURN 字节数",
          series: { alkanes: "Alkanes", rest: "其他 OP_RETURN" },
          desc: "Alkanes 的 OP_RETURN 负载小且稳定（约 {bytesPerTx} 字节/笔），而其余 OP_RETURN 流量体积更大、波动更明显——Alkanes 在链上的字节效率更高。（字节数 = 完整的 OP_RETURN 输出脚本。）",
        },
        minerRevenueUsd: {
          title: "矿工手续费收入",
          desc: "每日收入按抽样区块外推至完整一天，并加上 3.125 BTC/区块的区块补贴，再按当天 BTC 价格换算为美元。这里的美元波动主要来自 BTC 价格——矿工收入中真正随活动变化的部分是手续费，下一图以 BTC 展示。",
        },
        feesSplitBtc: {
          title: "矿工手续费收入（BTC）— Alkanes 与其他",
          series: { alkanes: "Alkanes 手续费", rest: "其他手续费" },
          desc: "区块补贴固定为 3.125 BTC/区块，因此矿工收入中随链上活动增长的部分是手续费。此图展示每日手续费（以 BTC 计），拆分为 Alkanes 交易支付部分与其余部分——从而看出随着 Alkanes 活动增长，其对矿工 BTC 收入的真实贡献。不含区块补贴。",
        },
        alkanesFeeShare: {
          title: "Alkanes 占矿工手续费收入的份额",
          desc: "按手续费收入——矿工实际从手续费中赚取的部分——Alkanes 最近 30 天占 {feeShare30}（整个统计期占 {feeShareFull}），远低于其交易笔数份额，因为大多数 Alkanes 交易是支付极少的小额 DIESEL 铸造。同样按最近 30 天计，全部 OP_RETURN 流量合计占手续费收入的 {opRetFeeShare30}（整个统计期为 {opRetFeeShareFull}）。（不含区块补贴，仅统计手续费。）",
        },
        fourAnswers: {
          title: "Alkanes 占比特币多少？四种答案",
          series: { byTx: "按交易笔数", byBytes: "按 OP_RETURN 字节", byWeight: "按区块 weight", byFee: "按矿工手续费收入" },
          desc: "同一个问题的四种答案叠加在一起：Alkanes 占比特币的份额，分别按交易笔数、按 OP_RETURN 数据字节、按区块 weight、以及按矿工手续费收入衡量。按笔数看 Alkanes 占比很高（大多是极小的 DIESEL 铸造）；按 weight 和按手续费看则小得多——诚实的答案取决于用哪把尺子。",
        },
        dieselMintsPerDay: {
          title: "每日 DIESEL 铸造 — 诞生曲线",
          desc: "DIESEL 于 2025 年 1 月 20 日在区块 880,000 诞生。这里展示原始铸造量——每日估算铸造数（抽样区块 × 144）——采用对数刻度以便早期数据仍然可见：从 2025 年初每天寥寥数笔，到峰值约每天 551,346 笔。2025 年 8–9 月的起飞，正是 DIESEL 铸造爆发（并开始搭乘 UNCOMMON•GOODS）之时。",
        },
        dieselCumulative: {
          title: "DIESEL 铸造总量 — 自创世累计",
          desc: "自创世（区块 880,000，2025 年 1 月 20 日）以来估算的 DIESEL 铸造累计总量——即上方每日诞生曲线的累加。随着 2025 年铸造加速，曲线持续变陡。",
        },
        feePerTx: {
          title: "每笔交易的手续费 — Alkanes 与其他",
          series: { alkanes: "Alkanes 交易", rest: "非 Alkanes 交易" },
          desc: "每笔交易支付的平均手续费（以 sats 计），拆分为 Alkanes 交易与其余交易。Alkanes 交易大多是支付较少的小额 DIESEL 铸造，因此每笔通常低于比特币其余流量——与其按笔数计的份额恰好相反。（每日手续费 ÷ 各类别交易数；不含区块补贴。）",
        },
        ugMintsPerDay: {
          title: "每日 UNCOMMON•GOODS 铸造 — 被 DIESEL 接管",
          series: { diesel: "DIESEL", independent: "独立 Runes" },
          desc: "几乎每一笔 DIESEL 铸造都会同时铸造 UNCOMMON•GOODS（符文 1:0）。此图将每日 UNCOMMON•GOODS 铸造拆分为由 DIESEL 驱动的部分与真正独立的 Runes——DIESEL 已在数量上占据主导。（抽样区块中的原始计数。）",
        },
        runesVsAlkanesShare: {
          title: "Runes（非 Alkanes）与 Alkanes — 占 OP_RETURN 字节的份额",
          series: { alkanes: "Alkanes", pureRunes: "Runes（非 Alkanes）" },
          desc: "在全部 OP_RETURN 数据字节中，Alkanes 与非 Alkanes 的 Runes（不含 Alkanes protostone 的符文石）各自写入的份额。在比特币的 OP_RETURN 字节预算上，Alkanes 已超越 Runes。",
        },
        runesVsAlkanesBytes: {
          title: "Runes（非 Alkanes）与 Alkanes — 每日绝对字节数",
          series: { alkanes: "Alkanes", pureRunes: "Runes（非 Alkanes）" },
          desc: "以绝对值进行的同一比较——Alkanes 与非 Alkanes 的 Runes 每日估算的 OP_RETURN 字节数（抽样区块 × 144），采用对数刻度，使早期与近期的数据量都清晰可读。",
        },
        byteComposition: {
          title: "OP_RETURN 字节构成随时间变化",
          series: { alkanes: "Alkanes", pureRunes: "Runes（非 Alkanes）", other: "其他" },
          desc: "OP_RETURN 字节预算在 Alkanes、非 Alkanes 的 Runes 与其他用途之间如何逐日划分——即上方自创世环形图的动态版本。",
        },
        runestoneTxShare: {
          title: "符文石交易 — Alkanes 与 Runes（非 Alkanes）",
          series: { alkanes: "Alkanes", pureRunes: "Runes（非 Alkanes）" },
          desc: "在每一笔携带符文石（Runestone）的交易中，属于 Alkanes（protostone 携带 protocol_tag = 1）与 Runes（非 Alkanes，即不含 Alkanes protostone 的符文石）各自的份额。创世之初 Runes 占据主导；如今 Alkanes 已占符文石交易的绝大多数。",
        },
        runestoneTxCount: {
          title: "每日符文石交易 — Alkanes 与 Runes（非 Alkanes）",
          series: { alkanes: "Alkanes", pureRunes: "Runes（非 Alkanes）" },
          desc: "以绝对值展示的同一划分——每日估算的符文石交易数（抽样区块外推至完整的 144 个区块一天），采用对数刻度，使早期以 Runes 为主的时期与如今的 Alkanes 交易量都清晰可读。",
        },
      },
    },
  },
} // one copy object per locale; keep both shapes identical (inference gives full typing)

const GRID: PublicMetricKey[] = ["diesel-holders", "diesel-price", "diesel-marketcap", "fire-price", "btc-diesel", "btc-fire"]

export async function generateMetadata({ searchParams }: { searchParams?: Promise<{ lang?: string }> }): Promise<Metadata> {
  const params = searchParams ? await searchParams : {}
  const locale: Locale = params.lang === "zh" ? "zh" : "en"
  const c = copy[locale]
  return {
    title: `${c.title} — subfrost.io/metrics`,
    description: c.subtitle,
    alternates: {
      canonical: absoluteUrl("/metrics"),
      languages: { en: absoluteUrl("/metrics"), zh: absoluteUrl("/metrics?lang=zh"), "x-default": absoluteUrl("/metrics") },
    },
    openGraph: {
      title: c.title,
      description: c.subtitle,
      images: [{ url: absoluteUrl("/metrics/card/btc-locked"), width: 1200, height: 675 }],
    },
    twitter: { card: "summary_large_image" },
  }
}

export default async function DataPage({ searchParams }: { searchParams?: Promise<{ lang?: string }> }) {
  const params = searchParams ? await searchParams : {}
  const locale: Locale = params.lang === "zh" ? "zh" : "en"
  const c = copy[locale]
  const [data, opreturn] = await Promise.all([getPublicData(), getPublicOpReturnData()])
  const showCharts = data.seriesDays >= 7
  const firstDate = data.series.length ? data.series[0].date : null

  return (
    <EditorialShell>
      <main className="mx-auto w-full max-w-[1440px] px-6 pb-24 pt-16">
        <header className="flex flex-col gap-3">
          <h1 className="text-4xl font-medium" style={{ color: "var(--ed-ink)" }}>{c.title}</h1>
          <p className="max-w-2xl text-lg" style={{ color: "var(--ed-muted)" }}>{c.subtitle}</p>
        </header>

        <section className="mt-10 grid gap-4 md:grid-cols-2">
          <MetricCard metric="btc-locked" value={data.now["btc-locked"]} deltaPct={data.deltas7d["btc-locked"]} series={data.series} showChart={showCharts} copy={c.card} locale={locale} />
          <MetricCard metric="frbtc-supply" value={data.now["frbtc-supply"]} deltaPct={data.deltas7d["frbtc-supply"]} series={data.series} showChart={showCharts} copy={c.card} locale={locale} />
        </section>

        <section className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {GRID.map((m) => (
            <MetricCard key={m} metric={m} value={data.now[m]} deltaPct={data.deltas7d[m]} series={data.series} showChart={showCharts} copy={c.card} locale={locale} />
          ))}
        </section>

        <OpReturnCharts payload={opreturn} copy={c.opreturn} locale={locale} />

        <footer className="mt-12 text-sm" style={{ color: "var(--ed-muted)" }}>
          {!showCharts && firstDate ? <span>{c.building} {firstDate}. </span> : null}
          {data.updatedAt ? <span>{c.updated}: {data.updatedAt.slice(0, 10)}.</span> : null}
        </footer>
      </main>
    </EditorialShell>
  )
}
