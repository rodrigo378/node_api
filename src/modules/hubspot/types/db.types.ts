export interface Api_Hubspot {
  id: string;

  firstname: string | null;
  lastname: string | null;
  carrera_o_especialidad: string | null;
  hs_lead_status: string | null;
  canal: string | null;
  email: string | null;
  mobilphone: string | null;
  campana_admision: string | null;
  como_te_enteraste: string | null;
  n__de_d_n_i: string | null;
  phone: string | null;
  edad: string | null;
  modalidad_de_estudio: string | null;
  turno: string | null;
  tipo_de_ingreso: string | null;
  colegio_de_procedencia: string | null;
  fecha_de_inscripcion: string | null;
  fecha_de_pagante: string | null;
  fecha_de_matricula: string | null;
  departamento: string | null;
  provincia_de_procedencia: string | null;
  distrito_de_procedencia: string | null;
  colegio: string | null;
  instituto_de_procedencia: string | null;
  universidad_de_procedencia: string | null;
  genero_m__f: string | null;
  estado_matricula: string | null;
  estado_pagos: string | null;
  estado_postulante: string | null;

  owern_name: string | null;

  created_at: Date;
  updated_at: Date;
}

export interface Api_Hubspot_Consolidado {
  id: string;
  n__de_d_n_i: string | null;
  campana_admision: string | null;
  firstname: string | null;
  lastname: string | null;
  carrera_o_especialidad: string | null;
  hs_lead_status: string | null;
  canal: string | null;
  email: string | null;
  mobilphone: string | null;
  como_te_enteraste: string | null;
  phone: string | null;
  edad: string | null;
  modalidad_de_estudio: string | null;
  turno: string | null;
  tipo_de_ingreso: string | null;
  colegio_de_procedencia: string | null;
  fecha_de_inscripcion: string | null;
  fecha_de_pagante: string | null;
  fecha_de_matricula: string | null;
  departamento: string | null;
  provincia_de_procedencia: string | null;
  distrito_de_procedencia: string | null;
  colegio: string | null;
  instituto_de_procedencia: string | null;
  universidad_de_procedencia: string | null;
  genero_m__f: string | null;
  estado_matricula: string | null;
  estado_pagos: string | null;
  estado_postulante: string | null;
  cantidad: string | null;
  ids: string | null;

  owern_name: string | null;

  created_at: Date;
  updated_at: Date;
}
