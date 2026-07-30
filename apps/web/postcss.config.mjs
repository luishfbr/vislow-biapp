// Tailwind do EDITOR: sem prefixo, para a interface do app.
// O CSS do visual-kit (prefixado `pbi:`) e pre-compilado e importado a parte —
// os dois convivem sem colidir, que e a razao de o runtime usar prefixo.
export default {
  plugins: { '@tailwindcss/postcss': {} },
};
