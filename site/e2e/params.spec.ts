import { test, expect } from '@playwright/test'

test.describe('Query Params (/ route)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test.describe('Basic param setting', () => {
    test('boolean param toggles and updates URL', async ({ page }) => {
      // Initially disabled, no URL param
      await expect(page).toHaveURL('/')
      const enableBtn = page.getByRole('button', { name: 'Disabled' })
      await expect(enableBtn).toBeVisible()

      // Click to enable
      await enableBtn.click()
      await expect(page).toHaveURL('/?e')
      await expect(page.getByRole('button', { name: 'Enabled' })).toBeVisible()

      // Click to disable
      await page.getByRole('button', { name: 'Enabled' }).click()
      await expect(page).toHaveURL('/')
      await expect(page.getByRole('button', { name: 'Disabled' })).toBeVisible()
    })

    test('string param updates URL', async ({ page }) => {
      const input = page.locator('input[placeholder="Enter name..."]')
      await input.fill('hello')
      await expect(page).toHaveURL('/?n=hello')

      await input.fill('hello world')
      await expect(page).toHaveURL('/?n=hello+world')

      await input.clear()
      await expect(page).toHaveURL('/')
    })

    test('number params update URL', async ({ page }) => {
      const countInput = page.locator('input[type="number"]').first()
      await countInput.fill('5')
      await expect(page).toHaveURL('/?c=5')

      await countInput.fill('0')
      await expect(page).toHaveURL('/')
    })

    test('enum param updates URL', async ({ page }) => {
      await page.getByRole('button', { name: 'dark' }).click()
      await expect(page).toHaveURL('/?t=dark')

      await page.getByRole('button', { name: 'auto' }).click()
      await expect(page).toHaveURL('/?t=auto')

      await page.getByRole('button', { name: 'light' }).click()
      await expect(page).toHaveURL('/')
    })

    test('array param with multiple values', async ({ page }) => {
      await page.locator('.tag', { hasText: 'react' }).click()
      await expect(page).toHaveURL('/?tags=react')

      await page.locator('.tag', { hasText: 'vue' }).click()
      await expect(page).toHaveURL('/?tags=react+vue')

      await page.locator('.tag', { hasText: 'react' }).click()
      await expect(page).toHaveURL('/?tags=vue')

      await page.locator('.tag', { hasText: 'vue' }).click()
      await expect(page).toHaveURL('/')
    })
  })

  test.describe('Reset button', () => {
    test('clears all params and resets UI', async ({ page }) => {
      // Set multiple params one at a time, waiting for URL update
      await page.getByRole('button', { name: 'Disabled' }).click()
      await expect(page).toHaveURL(/\?.*e/)

      await page.locator('input[placeholder="Enter name..."]').fill('test')
      await expect(page).toHaveURL(/n=test/)

      await page.getByRole('button', { name: 'dark' }).click()
      await expect(page).toHaveURL(/t=dark/)

      // Click reset
      await page.locator('.url-reset').click()

      // URL should be clean
      await expect(page).toHaveURL('/')

      // UI should reset
      await expect(page.getByRole('button', { name: 'Disabled' })).toBeVisible()
      await expect(page.locator('input[placeholder="Enter name..."]')).toHaveValue('')
      await expect(page.getByRole('button', { name: 'light' })).toHaveClass(/active/)
    })
  })

  test.describe('Browser navigation', () => {
    test('navigating away and back preserves state', async ({ page }) => {
      // Set some params
      await page.getByRole('button', { name: 'Disabled' }).click()
      await page.getByRole('button', { name: 'dark' }).click()
      await expect(page).toHaveURL(/\?.*e/)
      await expect(page).toHaveURL(/t=dark/)

      // Navigate to hash mode (creates history entry)
      await page.getByRole('link', { name: 'Hash params are also supported.' }).click()
      await expect(page).toHaveURL(/\/hash/)

      // Go back - should restore query params page with state
      await page.goBack()
      await expect(page).toHaveURL(/\?.*e/)
      await expect(page).toHaveURL(/t=dark/)
      await expect(page.getByRole('button', { name: 'Enabled' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'dark' })).toHaveClass(/active/)
    })

    test('replaceState does not create history entries', async ({ page }) => {
      // Note: Hooks use replaceState by default, so param changes don't add history entries
      // This test verifies that behavior
      await page.getByRole('button', { name: 'Disabled' }).click()
      await page.getByRole('button', { name: 'dark' }).click()

      // Going back should leave the site (no intermediate states)
      await page.goBack()
      // We should be at about:blank or the previous page, not an intermediate state
      const url = page.url()
      expect(url).not.toMatch(/localhost:5188\/\?e$/)
    })
  })

  test.describe('Direct URL navigation', () => {
    test('loads state from URL on initial load', async ({ page }) => {
      await page.goto('/?e&n=hello&t=dark')

      await expect(page.getByRole('button', { name: 'Enabled' })).toBeVisible()
      await expect(page.locator('input[placeholder="Enter name..."]')).toHaveValue('hello')
      await expect(page.getByRole('button', { name: 'dark' })).toHaveClass(/active/)
    })

    test('handles URL with encoded characters', async ({ page }) => {
      await page.goto('/?n=hello+world')
      await expect(page.locator('input[placeholder="Enter name..."]')).toHaveValue('hello world')
    })

    test('handles programmatic URL change via History API', async ({ page }) => {
      await page.goto('/')

      // Simulate external code changing URL via pushState
      await page.evaluate(() => {
        window.history.pushState({}, '', '/?e&t=auto')
      })

      // UI should update reactively
      await expect(page.getByRole('button', { name: 'Enabled' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'auto' })).toHaveClass(/active/)
    })
  })
})

test.describe('Hash Params (/hash route)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/hash')
  })

  test('boolean param updates hash', async ({ page }) => {
    await page.getByRole('button', { name: 'Disabled' }).click()
    await expect(page).toHaveURL('/hash#e')

    await page.getByRole('button', { name: 'Enabled' }).click()
    await expect(page).toHaveURL('/hash')
  })

  test('string param updates hash', async ({ page }) => {
    await page.locator('input[placeholder="Enter name..."]').fill('test')
    await expect(page).toHaveURL('/hash#n=test')
  })

  test('reset clears hash', async ({ page }) => {
    await page.getByRole('button', { name: 'Disabled' }).click()
    await expect(page).toHaveURL(/\/hash#.*e/)

    await page.getByRole('button', { name: 'dark' }).click()
    await expect(page).toHaveURL(/t=dark/)

    await page.locator('.url-reset').click()
    await expect(page).toHaveURL('/hash')
  })

  test('navigating away and back preserves hash state', async ({ page }) => {
    // Set some params
    await page.getByRole('button', { name: 'Disabled' }).click()
    await page.getByRole('button', { name: 'dark' }).click()
    await expect(page).toHaveURL(/\/hash#.*e/)
    await expect(page).toHaveURL(/t=dark/)

    // Navigate to query mode (creates history entry)
    await page.getByRole('link', { name: 'Query params are also supported.' }).click()
    await expect(page).toHaveURL(/^http:\/\/localhost:5188\/\?/)

    // Go back - should restore hash params page with state
    await page.goBack()
    await expect(page).toHaveURL(/\/hash#.*e/)
    await expect(page).toHaveURL(/t=dark/)
    await expect(page.getByRole('button', { name: 'Enabled' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'dark' })).toHaveClass(/active/)
  })

  test('loads state from hash on initial load', async ({ page }) => {
    await page.goto('/hash#e&n=world&t=auto')

    await expect(page.getByRole('button', { name: 'Enabled' })).toBeVisible()
    await expect(page.locator('input[placeholder="Enter name..."]')).toHaveValue('world')
    await expect(page.getByRole('button', { name: 'auto' })).toHaveClass(/active/)
  })

  test('handles programmatic hash change', async ({ page }) => {
    await page.goto('/hash')

    // Simulate external code changing hash
    await page.evaluate(() => {
      window.location.hash = '#e&t=dark'
    })

    await expect(page.getByRole('button', { name: 'Enabled' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'dark' })).toHaveClass(/active/)
  })
})

test.describe('Mode switching (query ↔ hash)', () => {
  test('switching from query to hash preserves params', async ({ page }) => {
    await page.goto('/?e&n=test&t=dark')

    // Click link to hash mode
    await page.getByRole('link', { name: 'Hash params are also supported.' }).click()

    // URL params can be in any order
    await expect(page).toHaveURL(/\/hash#/)
    await expect(page.getByRole('button', { name: 'Enabled' })).toBeVisible()
    await expect(page.locator('input[placeholder="Enter name..."]')).toHaveValue('test')
    await expect(page.getByRole('button', { name: 'dark' })).toHaveClass(/active/)
  })

  test('switching from hash to query preserves params', async ({ page }) => {
    await page.goto('/hash#e&n=hello&t=auto')

    // Click link to query mode
    await page.getByRole('link', { name: 'Query params are also supported.' }).click()

    // URL params can be in any order
    await expect(page).toHaveURL(/\/\?/)
    await expect(page.getByRole('button', { name: 'Enabled' })).toBeVisible()
    await expect(page.locator('input[placeholder="Enter name..."]')).toHaveValue('hello')
    await expect(page.getByRole('button', { name: 'auto' })).toHaveClass(/active/)
  })
})

test.describe('URL preview display', () => {
  test('shows params in preview bar', async ({ page }) => {
    await page.goto('/')

    const urlDisplay = page.locator('.url-display')
    await expect(urlDisplay).toContainText('/')

    await page.getByRole('button', { name: 'Disabled' }).click()
    await expect(page).toHaveURL('/?e')
    await expect(urlDisplay).toContainText('e')

    await page.locator('input[placeholder="Enter name..."]').fill('hi')
    await expect(page).toHaveURL(/n=hi/)
    await expect(urlDisplay).toContainText('n=hi')
  })

  test('highlights param on section hover', async ({ page }) => {
    await page.goto('/?e&n=test')

    // Hover over Boolean section
    const boolSection = page.locator('section', { hasText: 'Boolean (boolParam)' })
    await boolSection.hover()

    // The e param segment should be highlighted
    const highlightedSpan = page.locator('.url-display .highlight')
    await expect(highlightedSpan).toContainText('e')
  })

  test('reset button visibility follows URL state', async ({ page }) => {
    await page.goto('/')

    // No reset button initially (no params)
    await expect(page.locator('.url-reset')).not.toBeVisible()

    // Add a param
    await page.getByRole('button', { name: 'Disabled' }).click()
    await expect(page).toHaveURL('/?e')

    // Reset button should appear
    await expect(page.locator('.url-reset')).toBeVisible()

    // Click reset
    await page.locator('.url-reset').click()

    // URL should be clean
    await expect(page).toHaveURL('/')

    // Reset button should disappear
    await expect(page.locator('.url-reset')).not.toBeVisible()
  })
})

test.describe('Debounce value stability', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('value does not revert on unrelated re-render during debounce window', async ({ page }) => {
    const value = page.locator('[data-testid="debounce-value"]')

    // Initial state
    await expect(value).toHaveText('0')

    // Set debounced value and immediately trigger unrelated re-render
    // Both happen in the same evaluate to ensure the bump fires before debounce
    await page.evaluate(() => {
      const input = document.querySelector('[data-testid="debounce-input"]') as HTMLInputElement
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      nativeInputValueSetter.call(input, '42')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))

      // Immediately trigger unrelated re-render
      const bumpBtn = document.querySelector('[data-testid="debounce-bump"]') as HTMLButtonElement
      bumpBtn.click()
    })

    // Value should not snap back to 0 during debounce window
    await expect(value).toHaveText('42')

    // Wait for debounce to fire, then verify URL and value
    await page.waitForTimeout(600)
    await expect(page).toHaveURL(/d=42/)
    await expect(value).toHaveText('42')
  })

  test('rapid setValue calls preserve final value', async ({ page }) => {
    const input = page.locator('[data-testid="debounce-input"]')
    const value = page.locator('[data-testid="debounce-value"]')

    // Rapid-fire value changes (simulating slider drag)
    for (const v of [10, 20, 30, 40, 50]) {
      await input.fill(String(v))
    }

    // Should show final value immediately
    await expect(value).toHaveText('50')

    // URL updates only once, after debounce
    await page.waitForTimeout(600)
    await expect(page).toHaveURL(/d=50/)
  })

  test('external navigation during debounce wins', async ({ page }) => {
    // Navigate to a state first (so we have history to go back to)
    await page.goto('/?n=hello')
    await expect(page).toHaveURL('/?n=hello')

    const input = page.locator('[data-testid="debounce-input"]')

    // Set debounced value
    await input.fill('99')

    // Navigate back before debounce fires
    await page.goBack()

    // The back navigation should win — URL should not contain d=99
    await page.waitForTimeout(600)
    expect(page.url()).not.toContain('d=99')
  })
})
