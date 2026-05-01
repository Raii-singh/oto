$word = New-Object -ComObject Word.Application
$word.Visible = $false
$doc = $word.Documents.Open("r:\WTF\Projects\OTO\bin\OTO-Platform-Documentation.docx")
$text = $doc.Content.Text
$text | Out-File -FilePath "r:\WTF\Projects\OTO\bin\doc_text.txt" -Encoding UTF8
$doc.Close([ref]$false)
$word.Quit()
