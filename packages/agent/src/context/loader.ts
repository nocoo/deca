import {
  type BootstrapFile,
  type ContextFile,
  DEFAULT_HEARTBEAT_FILENAME,
  DEFAULT_SOUL_FILENAME,
  buildBootstrapContextFiles,
  filterBootstrapFilesForSession,
  loadWorkspaceBootstrapFiles,
} from "./bootstrap.js";

export class ContextLoader {
  private workspaceDir: string;
  private maxChars?: number;
  private warn?: (message: string) => void;

  constructor(
    workspaceDir: string,
    opts?: {
      maxChars?: number;
      warn?: (message: string) => void;
    },
  ) {
    this.workspaceDir = workspaceDir;
    this.maxChars = opts?.maxChars;
    this.warn = opts?.warn;
  }

  /**
   * 加载并过滤 Bootstrap 文件
   */
  async loadBootstrapFiles(params?: {
    sessionKey?: string;
  }): Promise<BootstrapFile[]> {
    const files = await loadWorkspaceBootstrapFiles(this.workspaceDir);
    return filterBootstrapFilesForSession(files, params?.sessionKey);
  }

  /**
   * 构建系统提示的上下文部分（Project Context）
   */
  async buildContextPrompt(params?: { sessionKey?: string }): Promise<string> {
    const files = await this.loadBootstrapFiles(params);
    const contextFiles = buildBootstrapContextFiles(files, {
      maxChars: this.maxChars,
      warn: this.warn,
    });
    if (contextFiles.length === 0) return "";

    const hasSoulFile = contextFiles.some((file) => {
      const normalized = file.path.trim().replace(/\\/g, "/");
      const baseName = normalized.split("/").pop() ?? normalized;
      return baseName.toLowerCase() === DEFAULT_SOUL_FILENAME.toLowerCase();
    });

    const lines: string[] = [
      "",
      "# Project Context",
      "",
      "The following project context files have been loaded:",
    ];
    if (hasSoulFile) {
      lines.push(
        "If SOUL.md is present, embody its persona and tone. Avoid stiff, generic replies.",
      );
    }
    lines.push("");

    for (const file of contextFiles) {
      lines.push(`## ${file.path}`, "", file.content, "");
    }

    return lines.join("\n");
  }

  /**
   * 检查 HEARTBEAT.md 是否有待办任务
   */
  async hasHeartbeatTasks(): Promise<boolean> {
    const files = await loadWorkspaceBootstrapFiles(this.workspaceDir);
    const heartbeat = files.find((f) => f.name === DEFAULT_HEARTBEAT_FILENAME);
    if (!heartbeat?.content) return false;

    // 检查是否有非空内容 (排除标题和空行)
    const lines = heartbeat.content.split("\n");
    return lines.some((line) => {
      const trimmed = line.trim();
      return (
        trimmed &&
        !/^#+(\s|$)/.test(trimmed) &&
        !/^[-*+]\s*(\[[\sXx]?\]\s*)?$/.test(trimmed)
      );
    });
  }
}

export type { ContextFile };
