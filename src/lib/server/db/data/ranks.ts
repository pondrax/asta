import { db } from ".."

export default async () => {
  console.log('Upserting ranks...')
  await db.query.ranks.upsert({
    data: [
      { id: '_00', rank: "-", grade: "-" },

      // Golongan IV (Pembina)
      { id: '_01', rank: "IV/e", grade: "Pembina Utama" },
      { id: '_02', rank: "IV/d", grade: "Pembina Utama Madya" },
      { id: '_03', rank: "IV/c", grade: "Pembina Utama Muda" },
      { id: '_04', rank: "IV/b", grade: "Pembina Tingkat I" },
      { id: '_05', rank: "IV/a", grade: "Pembina" },

      // Golongan III (Penata)
      { id: '_06', rank: "III/d", grade: "Penata Tingkat I" },
      { id: '_07', rank: "III/c", grade: "Penata" },
      { id: '_08', rank: "III/b", grade: "Penata Muda Tingkat I" },
      { id: '_09', rank: "III/a", grade: "Penata Muda" },

      // Golongan II (Pengatur)
      { id: '_10', rank: "II/d", grade: "Pengatur Tingkat I" },
      { id: '_11', rank: "II/c", grade: "Pengatur" },
      { id: '_12', rank: "II/b", grade: "Pengatur Muda Tingkat I" },
      { id: '_13', rank: "II/a", grade: "Pengatur Muda" },

      // Golongan I (Juru)
      { id: '_14', rank: "I/d", grade: "Juru Tingkat I" },
      { id: '_15', rank: "I/c", grade: "Juru" },
      { id: '_16', rank: "I/b", grade: "Juru Muda Tingkat I" },
      { id: '_17', rank: "I/a", grade: "Juru Muda" },
    ]
  })
  console.log('Ranks upserted successfully!')
}