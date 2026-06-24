import { describe, it, expect, afterEach } from 'vitest'
import { isEmailEnabled, newArticleEmail } from '@/lib/cms/email'

const orig = process.env.RESEND_API_KEY
afterEach(() => { if (orig === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = orig })

describe('article email', () => {
  it('isEmailEnabled reflects RESEND_API_KEY', () => {
    delete process.env.RESEND_API_KEY
    expect(isEmailEnabled()).toBe(false)
    process.env.RESEND_API_KEY = 're_test'
    expect(isEmailEnabled()).toBe(true)
  })

  it('newArticleEmail builds a localized subject + html with the article link and unsubscribe url', () => {
    const { subject, html } = newArticleEmail({
      title: 'frBTC explained', excerpt: 'How wrapping works', slug: 'frbtc-explained',
      locale: 'en', unsubscribeUrl: 'https://subfrost.io/unsubscribe?token=abc&lang=en',
    })
    expect(subject).toContain('frBTC explained')
    expect(html).toContain('/articles/frbtc-explained')
    expect(html).toContain('https://subfrost.io/unsubscribe?token=abc&lang=en')
  })

  it('newArticleEmail localizes to zh', () => {
    const { html } = newArticleEmail({
      title: '标题', excerpt: '摘要', slug: 's', locale: 'zh',
      unsubscribeUrl: 'https://subfrost.io/unsubscribe?token=abc&lang=zh',
    })
    expect(html).toContain('退订') // unsubscribe label in zh
  })
})
