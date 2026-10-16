Option Explicit
Dim shell, files, root, command
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
root = files.GetParentFolderName(WScript.ScriptFullName)
command = "powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File " & Chr(34) & root & "\scripts\windows.ps1" & Chr(34) & " -StopServer"
shell.Run command, 0, False
