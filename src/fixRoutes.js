import fs from 'fs';

const lines = fs.readFileSync('routes/publicRoutes.js', 'utf8').split('\n');

const resJsonOrderIndex = lines.findIndex(line => line.includes('return res.json(order);'));

const goodTop = lines.slice(0, resJsonOrderIndex + 1).join('\n');
const goodBottom = lines.slice(620).join('\n'); // 620 is the empty line before GET /orders/:phone

const missingCatch = `
  } catch (error) {
    return next(error);
  }
});
`;

fs.writeFileSync('routes/publicRoutes.js', goodTop + missingCatch + goodBottom);
