import { Page } from 'playwright';
import { CAPTCHA_POLLING_ATTEMPTS, CAPTCHA_POLLING_INTERVAL } from './constants.js';

export class ChallengeHandler {
  /**
   * Handles Bing Anti-bot challenges (Captchas/Turnstile)
   */
  public static async handleBingChallenge(page: Page): Promise<boolean> {
    const url = page.url();
    const isRedirect = url.includes('rdr=1') || url.includes('rdrig=');

    if (isRedirect) {
      console.log(`[ChallengeHandler] BING: Detected redirect state ($rdr=1). Waiting for stability...`);
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page.waitForTimeout(1000);
    }

    console.log(
      `[ChallengeHandler] BING: Anti-bot challenge detected. Attempting bypass with ${CAPTCHA_POLLING_ATTEMPTS}s polling...`,
    );

    try {
      const checkboxSelector = '.ctp-checkbox-label, #challenge-stage, input[type="checkbox"]';
      let targetFrame = null;
      let box = null;

      for (let attempt = 1; attempt <= CAPTCHA_POLLING_ATTEMPTS; attempt++) {
        const frames = page.frames();

        // Check main page first
        if (await page.isVisible(checkboxSelector)) {
          targetFrame = page;
          box = await page.$(checkboxSelector);
        } else {
          // Check all frames
          for (const frame of frames) {
            try {
              if (await frame.isVisible(checkboxSelector)) {
                targetFrame = frame;
                box = await frame.$(checkboxSelector);
                break;
              }
            } catch (fErr) {
              /* Ignore frame access errors */
            }
          }
        }

        if (box) {
          console.log(`[ChallengeHandler] BING: Interaction point found on attempt ${attempt}!`);
          break;
        }

        if (attempt % 4 === 0)
          console.log(
            `[ChallengeHandler] BING: Still polling for captcha elements... (${attempt}/${CAPTCHA_POLLING_ATTEMPTS})`,
          );
        await page.waitForTimeout(CAPTCHA_POLLING_INTERVAL);
      }

      if (!box || !targetFrame) {
        console.log(
          `[ChallengeHandler] BING: Could not find captcha interaction point after ${CAPTCHA_POLLING_ATTEMPTS}s.`,
        );
        return false;
      }

      const boundingBox = await box.boundingBox();
      if (boundingBox) {
        console.log(`[ChallengeHandler] BING: Performing human-like click on verification box...`);
        const centerX = boundingBox.x + boundingBox.width / 2;
        const centerY = boundingBox.y + boundingBox.height / 2;

        // Move mouse in a slightly non-linear way with randomized jitter
        await page.mouse.move(centerX - 100 + Math.random() * 50, centerY - 100 + Math.random() * 50);
        await page.waitForTimeout(100 + Math.random() * 200);
        await page.mouse.move(centerX, centerY, { steps: 10 });
        await page.waitForTimeout(200 + Math.random() * 300);
        await page.mouse.click(centerX, centerY);

        console.log(`[ChallengeHandler] BING: Click performed, waiting for challenge to clear...`);
        await page.waitForTimeout(4000);

        const stillBlocked = await page.evaluate(() => {
          return !!(
            document.querySelector('.captcha') ||
            document.querySelector('#turnstile-wrapper') ||
            document.body.innerText.includes('Verify you are human') ||
            document.body.innerText.includes('One last step')
          );
        });

        if (!stillBlocked) {
          console.log(`[ChallengeHandler] BING: Challenge appears to be cleared!`);
          return true;
        } else {
          console.log(`[ChallengeHandler] BING: Challenge still present after click.`);
        }
      }

      return false;
    } catch (error) {
      console.error(`[ChallengeHandler] BING: Error during captcha detection/handling:`, error);
      return false;
    }
  }

  /**
   * Dismisses common consent banners
   */
  public static async dismissConsent(page: Page): Promise<void> {
    try {
      const selectors = ['#bnp_btn_accept', '#adlt_set_save', '.bnp_btn_accept'];
      for (const selector of selectors) {
        const isVisible = await page.isVisible(selector).catch(() => false);
        if (isVisible) {
          console.log(`[ChallengeHandler] BING: Dismissing consent banner (${selector})`);
          await page.click(selector).catch(() => {});
          await page.waitForTimeout(500);
        }
      }
    } catch (e) {
      // Ignore dismiss errors
    }
  }

  /**
   * Detects if the page is currently showing a challenge
   */
  public static async hasChallenge(page: Page): Promise<boolean> {
    return await page
      .evaluate(() => {
        const text = document.body.innerText;
        return !!(
          document.querySelector('.captcha') ||
          document.querySelector('#turnstile-wrapper') ||
          document.querySelector('#challenge-stage') ||
          text.includes('Verify you are human') ||
          text.includes('One last step') ||
          text.includes('Checking your browser')
        );
      })
      .catch(() => false);
  }
}
