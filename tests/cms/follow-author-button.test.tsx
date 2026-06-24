import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import FollowAuthorButton from '@/components/articles/FollowAuthorButton'

beforeEach(() => { (global.fetch as unknown) = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }) })
afterEach(() => cleanup())

describe('FollowAuthorButton', () => {
  it('posts the email + authorId to /api/articles/follow', async () => {
    const { getByPlaceholderText, getByRole, getAllByRole } = render(
      <FollowAuthorButton authorId="auth1" authorName="Gabe" locale="en" />,
    )
    // open the email field
    fireEvent.click(getAllByRole('button')[0])
    fireEvent.change(getByPlaceholderText(/email/i), { target: { value: 'a@x.com' } })
    // submit
    const form = getByRole('button', { name: /follow|subscribe|confirm|✓|→/i })
    fireEvent.click(form)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(String(url)).toBe('/api/articles/follow')
    const body = JSON.parse(String((init as RequestInit).body))
    expect(body).toMatchObject({ email: 'a@x.com', authorId: 'auth1', locale: 'en' })
  })
})
