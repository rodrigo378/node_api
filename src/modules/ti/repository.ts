import { Knex } from "knex";
import { DbName } from "../../core/const/db.const";
import { DbRegistry } from "../../core/db/registry";

export class TiRepository {
  constructor(private readonly registry: DbRegistry) {}

  private db(dbName: DbName): Knex {
    return this.registry.get(dbName);
  }

  async getMatriculados(courseid: number) {
    const [rows] = await this.db("SIGU_LECTURA").raw(`
      select 					
                  c.c_email_institucional
      from 
                  tb_alu_cur_grp a    
      left join 
                  tb_plan_estudio_curso b   
                  on a.c_codcur = b.c_codcur 
                  and a.c_codmod = b.c_codmod
                  and a.c_codfac = b.c_codfac 
                  and a.c_codesp = b.c_codesp
                  and a.n_codpla = b.n_codper 
      left join 	
                  tb_ficha_perso_alu c 
                  on a.c_codalu = c.c_codalu
      inner join 
                  tb_curso_grupo_sincro s
                  on a.n_codper = s.n_codper
                  and a.c_codcur = s.c_codcur
                  and a.n_codpla = s.n_codpla
                  and a.c_grpcur = s.c_grpcur
                  and a.c_codfac_alu = s.c_codfac
                  and a.c_codesp_alu = s.c_codesp
                  and a.c_codmod = s.c_codmod
                  
      where 
                  a.c_codalu not in (2119921,12345678) 
                  and s.courseid = ${courseid}
                  and a.c_estado = "M"
      group by 
                  a.c_codalu, 
                  b.c_nomcur,
                  a.c_codcur,
                  a.n_codper, 
                  a.c_estado,
                  a.c_codfac_alu, 
                  a.c_codesp_alu,
                  a.c_grpcur,
                  a.n_codpla,
                  a.d_date;
    `);
    return rows as { c_email_institucional: string }[];
  }

  async getDocentes(courseid: number) {
    const [rows] = await this.db("SIGU_LECTURA").raw(`
              select DISTINCT
                    c.c_email_institucional
        from
              tb_curso_grupo_sincro a
        join
                    tb_doc_cur_grp b
                    on  a.n_codper  = 	b.n_codper
                    and a.c_codfac  = b.c_codfac
                    and a.c_codesp  = b.c_codesp
                    and a.c_sedcod  = b.c_sedcod
                    and a.c_codcur  = b.c_codcur
                    and a.c_grpcur  = b.c_grpcur
                    and a.c_codmod  = b.c_codmod
                    and a.n_codpla  = b.n_codpla
        inner join
                    tb_ficha_perso_doc c
                    on b.c_dnidoc = c.c_dni
        where
                    a.courseid = ${courseid}
    `);
    return rows as { c_email_institucional: string }[];
  }
}
