Option Explicit
Dim shell, files, root, script, powershell, result
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
root = files.GetParentFolderName(WScript.ScriptFullName)
script = files.BuildPath(root, "scripts\windows.ps1")
If Not files.FileExists(script) Then
  MsgBox "Extraia o ZIP inteiro antes de abrir este atalho.", 48, "Parar Agenda"
  WScript.Quit 1
End If
powershell = files.BuildPath(shell.ExpandEnvironmentStrings("%SystemRoot%"), "System32\WindowsPowerShell\v1.0\powershell.exe")
On Error Resume Next
result = shell.Run(Chr(34) & powershell & Chr(34) & " -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File " & Chr(34) & script & Chr(34) & " -StopServer", 1, True)
If Err.Number <> 0 Then
  MsgBox "Nao foi possivel abrir: " & Err.Description, 48, "Parar Agenda"
  WScript.Quit 1
ElseIf result <> 0 Then
  MsgBox "A operacao nao foi concluida. Confira a mensagem exibida e se a pasta foi extraida inteira.", 48, "Parar Agenda"
  WScript.Quit result
End If
