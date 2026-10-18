import { test, expect, type Page } from '@playwright/test'

// The React parity page is an SPA route; the Vue parity page is a standalone
// Vite entry. Both mount the same keys/codecs (int n, string s, bool b, float
// f debounced, batched bx/by), so identical inputs must produce byte-equal
// query strings.
const PAGES = { react: '/parity', vue: '/vue.html' } as const

const searchOf = (page: Page) => new URL(page.url()).search

test.describe('React ↔ Vue parity', () => {
  test('identical inputs produce byte-equal URLs', async ({ page }) => {
    const drive = async (path: string): Promise<string> => {
      await page.goto(path)
      await page.getByTestId('n').fill('7')
      await page.getByTestId('s').fill('hi')
      await page.getByTestId('b').check()
      await expect.poll(() => searchOf(page)).toContain('s=hi')
      return searchOf(page)
    }
    const react = await drive(PAGES.react)
    const vue = await drive(PAGES.vue)
    expect(react).toBe('?n=7&s=hi&b')
    expect(vue).toBe(react)
  })

  for (const [name, path] of Object.entries(PAGES)) {
    test(`${name}: a debounced write keeps the last value (not dropped)`, async ({ page }) => {
      await page.goto(path)
      const q = page.getByTestId('q')
      await q.fill('a')
      await q.fill('ab')
      await q.fill('abc')
      await expect.poll(() => searchOf(page), { timeout: 2000 }).toBe('?q=abc')
    })

    test(`${name}: batched setValues writes both keys`, async ({ page }) => {
      await page.goto(path)
      await page.getByTestId('set-both').click()
      await expect.poll(() => searchOf(page)).toContain('bx=1')
      expect(searchOf(page)).toContain('by=2')
    })
  }
})
