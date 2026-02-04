import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { type Skill, SkillManager } from "./skills.js";

describe("SkillManager", () => {
  let tempWorkspace: string;
  let tempUserDir: string;
  let skillManager: SkillManager;

  beforeEach(async () => {
    tempWorkspace = await fs.mkdtemp(
      path.join(os.tmpdir(), "skills-workspace-"),
    );
    tempUserDir = await fs.mkdtemp(path.join(os.tmpdir(), "skills-user-"));
    skillManager = new SkillManager(tempWorkspace, tempUserDir);
  });

  afterEach(async () => {
    await fs.rm(tempWorkspace, { recursive: true, force: true });
    await fs.rm(tempUserDir, { recursive: true, force: true });
  });

  describe("loadAll and list", () => {
    it("should load builtin skills", async () => {
      const skills = await skillManager.list();

      expect(skills.length).toBeGreaterThan(0);
      expect(skills.some((s) => s.id === "code-review")).toBe(true);
      expect(skills.some((s) => s.id === "explain")).toBe(true);
      expect(skills.some((s) => s.id === "refactor")).toBe(true);
      expect(skills.some((s) => s.id === "test")).toBe(true);
    });

    it("should load skills from workspace skills directory", async () => {
      const skillsDir = path.join(tempWorkspace, "skills");
      await fs.mkdir(skillsDir, { recursive: true });
      await fs.writeFile(
        path.join(skillsDir, "custom.md"),
        `---
id: custom-skill
name: Custom Skill
description: A custom skill
triggers: ["/custom"]
---

Custom prompt here`,
      );

      const skills = await skillManager.list();
      const customSkill = skills.find((s) => s.id === "custom-skill");

      expect(customSkill).toBeDefined();
      expect(customSkill?.name).toBe("Custom Skill");
      expect(customSkill?.source).toBe("workspace");
      expect(customSkill?.triggers).toContain("/custom");
    });

    it("should load skills from .mini-agent/skills directory", async () => {
      const skillsDir = path.join(tempWorkspace, ".mini-agent/skills");
      await fs.mkdir(skillsDir, { recursive: true });
      await fs.writeFile(
        path.join(skillsDir, "hidden.md"),
        "Hidden skill prompt",
      );

      const skills = await skillManager.list();
      const hiddenSkill = skills.find((s) => s.id === "hidden");

      expect(hiddenSkill).toBeDefined();
      expect(hiddenSkill?.prompt).toBe("Hidden skill prompt");
    });

    it("should load user skills", async () => {
      const userSkillsDir = path.join(tempUserDir, "skills");
      await fs.mkdir(userSkillsDir, { recursive: true });
      await fs.writeFile(
        path.join(userSkillsDir, "user-skill.md"),
        `---
name: User Global Skill
---

User prompt`,
      );

      const skills = await skillManager.list();
      const userSkill = skills.find((s) => s.id === "user-skill");

      expect(userSkill).toBeDefined();
      expect(userSkill?.source).toBe("user");
    });

    it("should only load once", async () => {
      await skillManager.list();
      await skillManager.list();
      // Should not throw or cause issues
      const skills = await skillManager.list();
      expect(skills.length).toBeGreaterThan(0);
    });
  });

  describe("get", () => {
    it("should get skill by id", async () => {
      const skill = await skillManager.get("code-review");

      expect(skill).toBeDefined();
      expect(skill?.name).toBe("代码审查");
    });

    it("should return null for non-existent skill", async () => {
      const skill = await skillManager.get("non-existent");
      expect(skill).toBeNull();
    });
  });

  describe("match", () => {
    it("should match skill by trigger prefix", async () => {
      const match = await skillManager.match("/review my code");

      expect(match).toBeDefined();
      expect(match?.skill.id).toBe("code-review");
      expect(match?.matchedTrigger).toBe("/review");
    });

    it("should match case-insensitively", async () => {
      const match = await skillManager.match("/EXPLAIN this code");

      expect(match).toBeDefined();
      expect(match?.skill.id).toBe("explain");
    });

    it("should return null when no match", async () => {
      const match = await skillManager.match("just a normal message");
      expect(match).toBeNull();
    });

    it("should match custom workspace skills", async () => {
      const skillsDir = path.join(tempWorkspace, "skills");
      await fs.mkdir(skillsDir, { recursive: true });
      await fs.writeFile(
        path.join(skillsDir, "deploy.md"),
        `---
id: deploy
triggers: ["/deploy"]
---

Deploy prompt`,
      );

      const match = await skillManager.match("/deploy to production");

      expect(match).toBeDefined();
      expect(match?.skill.id).toBe("deploy");
    });
  });

  describe("register", () => {
    it("should register custom skill", async () => {
      const customSkill: Skill = {
        id: "runtime-skill",
        name: "Runtime Skill",
        description: "Added at runtime",
        triggers: ["/runtime"],
        prompt: "Runtime prompt",
        source: "builtin",
      };

      skillManager.register(customSkill);
      const skill = await skillManager.get("runtime-skill");

      expect(skill).toBeDefined();
      expect(skill?.name).toBe("Runtime Skill");
    });

    it("should override existing skill after loadAll", async () => {
      // First trigger loadAll by getting a skill
      await skillManager.get("code-review");

      // Now register override - this should replace the builtin
      const overrideSkill: Skill = {
        id: "code-review",
        name: "Custom Review",
        description: "Override",
        prompt: "Override prompt",
        source: "workspace",
      };

      skillManager.register(overrideSkill);
      const skill = await skillManager.get("code-review");

      expect(skill?.name).toBe("Custom Review");
    });
  });

  describe("buildSkillsPrompt", () => {
    it("should build formatted skills prompt", async () => {
      const prompt = await skillManager.buildSkillsPrompt();

      expect(prompt).toContain("## 可用技能");
      expect(prompt).toContain("代码审查");
      expect(prompt).toContain("/review");
    });

    it("should include custom skills", async () => {
      skillManager.register({
        id: "custom",
        name: "Custom",
        description: "Custom desc",
        triggers: ["/custom"],
        prompt: "prompt",
        source: "workspace",
      });

      const prompt = await skillManager.buildSkillsPrompt();

      expect(prompt).toContain("Custom");
      expect(prompt).toContain("/custom");
    });
  });

  describe("skill file parsing", () => {
    it("should parse frontmatter with arrays", async () => {
      const skillsDir = path.join(tempWorkspace, "skills");
      await fs.mkdir(skillsDir, { recursive: true });
      await fs.writeFile(
        path.join(skillsDir, "multi-trigger.md"),
        `---
id: multi
triggers: ["/a", "/b", "/c"]
---

Prompt`,
      );

      const skill = await skillManager.get("multi");

      expect(skill?.triggers).toEqual(["/a", "/b", "/c"]);
    });

    it("should use filename as id when no frontmatter", async () => {
      const skillsDir = path.join(tempWorkspace, "skills");
      await fs.mkdir(skillsDir, { recursive: true });
      await fs.writeFile(
        path.join(skillsDir, "simple-skill.md"),
        "Just a prompt without frontmatter",
      );

      const skill = await skillManager.get("simple-skill");

      expect(skill).toBeDefined();
      expect(skill?.id).toBe("simple-skill");
      expect(skill?.prompt).toBe("Just a prompt without frontmatter");
    });
  });
});
