import { App, FuzzySuggestModal, TFile } from "obsidian";

export class PrgFilePicker extends FuzzySuggestModal<TFile> {
  private readonly choose: (file: TFile) => void;

  constructor(app: App, choose: (file: TFile) => void) {
    super(app);
    this.choose = choose;
    this.setPlaceholder("选择要预览的 .prg 文件");
    this.emptyStateText = "库里没有 .prg 文件";
    this.limit = 100;
  }

  override getItems(): TFile[] {
    return this.app.vault
      .getFiles()
      .filter((file) => file.extension === "prg")
      .sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
  }

  override getItemText(file: TFile): string {
    return file.path;
  }

  override onChooseItem(file: TFile): void {
    this.choose(file);
  }
}
