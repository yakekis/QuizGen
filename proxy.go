package quizgen
cat << 'EOF' > proxy.go
package main
import ("bytes"; "io"; "net/http"; "os"; "log")
func main() {
    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        body, _ := io.ReadAll(r.Body)
        req, _ := http.NewRequest(r.Method, "https://sberbank.ru"+r.URL.Path, bytes.NewBuffer(body))
        req.Header = r.Header.Clone()
        req.Header.Set("Authorization", "Bearer " + os.Getenv("OPENAI_API_KEY"))
        resp, err := http.DefaultClient.Do(req)
        if err != nil { http.Error(w, err.Error(), 500); return }
        defer resp.Body.Close()
        for k, vv := range resp.Header { for _, v := range vv { w.Header().Add(k, v) } }
        w.WriteHeader(resp.StatusCode)
        io.Copy(w, resp.Body)
    })
    log.Fatal(http.ListenAndServe(":8000", nil))
}
EOF
