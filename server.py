#!/usr/bin/env python3
"""开发用本地服务器：禁用缓存，确保每次刷新加载最新文件。"""
import http.server
import socketserver

PORT = 8137

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def guess_type(self, path):
        t = super().guess_type(path)
        if path.endswith('.js'):
            return 'text/javascript'
        return t

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"送报少年运行中: http://localhost:{PORT}/")
    httpd.serve_forever()
