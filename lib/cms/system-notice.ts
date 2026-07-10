// The one global site notice — read side (no auth; used by the public API route
// and the admin page loader). Mutations live in actions/admin/system-notice.ts.
import prisma from "@/lib/prisma"

export interface SystemNoticeDTO {
  enabled: boolean
  showBanner: boolean
  showModal: boolean
  titleEn: string
  messageEn: string
  titleZh: string
  messageZh: string
  updatedAt: string | null
  updatedBy: string | null
}

export async function getSystemNotice(): Promise<SystemNoticeDTO> {
  const row = await prisma.systemNotice.findUnique({ where: { id: 1 } })
  return {
    enabled: row?.enabled ?? false,
    showBanner: row?.showBanner ?? true,
    showModal: row?.showModal ?? true,
    titleEn: row?.titleEn ?? "",
    messageEn: row?.messageEn ?? "",
    titleZh: row?.titleZh ?? "",
    messageZh: row?.messageZh ?? "",
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    updatedBy: row?.updatedBy ?? null,
  }
}

/** Public wire shape consumed by the app (locale-nested). Exposes `updatedAt`
 *  (shown on the notice as a timestamp) but never the `updatedBy` admin id. */
export function toNoticePayload(dto: SystemNoticeDTO) {
  return {
    enabled: dto.enabled,
    showBanner: dto.showBanner,
    showModal: dto.showModal,
    updatedAt: dto.updatedAt,
    en: { title: dto.titleEn, message: dto.messageEn },
    zh: { title: dto.titleZh, message: dto.messageZh },
  }
}
