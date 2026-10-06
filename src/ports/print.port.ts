export interface PrintPort {
  /**
   * 触发系统打印对话框。afterPrint 在打印对话框关闭（确认或取消）后回调，
   * 界面据此结束本次打印准备会话。
   */
  print(afterPrint?: () => void): void;
}
