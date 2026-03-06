# Deploy no GitHub + Vercel

## 1) Configurar variáveis na Vercel
No projeto da Vercel, adicione em **Settings > Environment Variables**:

- `PARADISE_API_KEY`
- `PARADISE_PRODUCT_HASH`
- `PARADISE_AMOUNT_CENTS`
- `PARADISE_UPSELL_URL`

Use os dados privados da Paradise no backend (não exponha no frontend).

## 2) Publicar no GitHub
No terminal, dentro da pasta do projeto:

```bash
git init
git add .
git commit -m "feat: migrate pix gateway to blackcatpay via vercel api"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
git push -u origin main
```

## 3) Importar na Vercel
- Acesse https://vercel.com/new
- Importe o repositório
- Deploy

## 4) Teste do fluxo PIX
- Abrir checkout e gerar PIX
- Confirmar retorno de QR Code / copia e cola
- Confirmar polling de status a cada 3s
- Após pagamento, confirmar retorno de `redirect_url` no backend

## Observação
Este workspace é um mirror estático sem código-fonte original (apenas bundle minificado). A migração foi feita com:
- API serverless em `/api/pix/*`
- Camada de compatibilidade no frontend para redirecionar chamadas antigas do gateway
