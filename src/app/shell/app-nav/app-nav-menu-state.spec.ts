import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOVER_CLOSE_DELAY_MS, NavMenuState } from "./app-nav-menu-state";

describe("NavMenuState", () => {
  let state: NavMenuState;

  beforeEach(() => {
    vi.useFakeTimers();
    state = new NavMenuState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("module menu", () => {
    it("does nothing on enter/leave/click until hover capability is known", () => {
      state.onModuleMenuEnter();
      expect(state.moduleMenuOpen()).toBe(false);

      state.onModuleMenuTriggerClick();
      expect(state.moduleMenuOpen()).toBe(true);
      state.onModuleMenuTriggerClick();
      expect(state.moduleMenuOpen()).toBe(false);

      state.onModuleMenuLeave();
      vi.advanceTimersByTime(HOVER_CLOSE_DELAY_MS);
      expect(state.moduleMenuOpen()).toBe(false);
    });

    it("auto-opens on enter and closes after the hover-close delay", () => {
      state.hoverCapable.set(true);
      state.onModuleMenuEnter();
      expect(state.moduleMenuOpen()).toBe(true);

      state.onModuleMenuLeave();
      vi.advanceTimersByTime(HOVER_CLOSE_DELAY_MS - 1);
      expect(state.moduleMenuOpen()).toBe(true);
      vi.advanceTimersByTime(1);
      expect(state.moduleMenuOpen()).toBe(false);
    });

    it("cancels a pending close when the pointer returns", () => {
      state.hoverCapable.set(true);
      state.onModuleMenuEnter();
      state.onModuleMenuLeave();
      state.onModuleMenuEnter();
      vi.advanceTimersByTime(HOVER_CLOSE_DELAY_MS);
      expect(state.moduleMenuOpen()).toBe(true);
    });

    it("only ensures open on a hover-capable click, never toggles closed", () => {
      state.hoverCapable.set(true);
      state.onModuleMenuEnter();
      state.onModuleMenuTriggerClick();
      expect(state.moduleMenuOpen()).toBe(true);
      state.onModuleMenuTriggerClick();
      expect(state.moduleMenuOpen()).toBe(true);
    });
  });

  describe("console menu", () => {
    it("does nothing without hover capability", () => {
      state.onConsoleMenuEnter();
      expect(state.consoleMenuOpen()).toBe(false);
    });

    it("auto-opens on enter and closes after the hover-close delay", () => {
      state.hoverCapable.set(true);
      state.onConsoleMenuEnter();
      expect(state.consoleMenuOpen()).toBe(true);

      state.onConsoleMenuLeave();
      vi.advanceTimersByTime(HOVER_CLOSE_DELAY_MS);
      expect(state.consoleMenuOpen()).toBe(false);
    });
  });
});
