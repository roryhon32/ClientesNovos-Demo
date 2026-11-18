from datetime import date, timedelta
from calendar import monthrange
import logging
from time import perf_counter

from .repository import Repository
from .schemas import QueryFilters


# Each cohort is one API result row; cap nested cells separately so that a
# larger configured row limit cannot create an unbounded JSON matrix.
MAX_COHORT_CELLS = 10_000


class Services:
    def __init__(self, conn, max_rows=1000):
        self.repo = Repository(conn)
        self.a = self.repo.analytics
        self.max_rows = max_rows
        self.started = perf_counter()

    def bounded(self, rows):
        if len(rows)>self.max_rows:
            raise ValueError("Resultado excede o limite; restrinja filtros ou acompanhamento")
        return rows

    def meta(self, f, period_type, population, segmentation):
        return {"reference_date":self.a.reference_date,"period_type":period_type,
                "population":population,"segmentation":segmentation,
                "start_date":f.start_date,"end_date":f.end_date,
                "notes":["Moeda da origem não validada; não há conversão monetária.",
                         "Financeiros incompletos são NULL; percentuais não são aditivos."]}

    def wrap(self, f, data, period="acquisition", population="globally_acquired_customers", segmentation="first_purchase_attributes"):
        logging.getLogger("customer_intelligence.api").info("analytics_complete seconds=%.6f returned_rows=%d", perf_counter()-self.started, len(data) if isinstance(data,list) else len(data.get("items",[data])))
        return {"meta":self.meta(f,period,population,segmentation),"data":data}

    @staticmethod
    def window(row, days):
        eligible=row.get(f"clientes_elegiveis_recompra_{days}d",0)
        immature=row.get(f"clientes_imaturos_{days}d",0)
        return {"days":days,"eligible_customers":eligible,"immature_customers":immature,
                "repurchased_customers":row.get(f"clientes_recompra_{days}d",0),
                "rate_pct":row.get(f"taxa_recompra_{days}d"),"mature":immature==0 and eligible>0}

    def retention(self, f):
        row=self.a.acquisition(f.analytical(),group_by=()).to_dicts()[0]
        return self.wrap(f,{"windows":[self.window(row,d) for d in (30,60,90,180)],
                            "mean_days_to_second_purchase":row.get("media_dias_ate_segunda_compra"),
                            "median_days_to_second_purchase":row.get("mediana_dias_ate_segunda_compra")})

    def overview(self, f):
        # Produto/família só têm definição financeira: não inventar atribuição à aquisição.
        acquired=self.a.acquisition(f.analytical(),group_by=()).to_dicts()[0]
        finance=self.a.financial_summary(f.analytical()).to_dicts()[0]
        growth=None
        if f.start_date and f.end_date and f.end_date<=self.a.reference_date:
            span=(f.end_date-f.start_date).days+1
            previous_start=f.start_date-timedelta(days=span)
            if previous_start>=self.a.history_start:
                prev=f.model_copy(update={"start_date":previous_start,"end_date":f.start_date-timedelta(days=1)})
                previous=self.a.acquisition(prev.analytical(),group_by=()).to_dicts()[0]["clientes_novos"]
                if previous:
                    growth=100*(acquired["clientes_novos"]-previous)/previous
        return self.wrap(f,{"company_transaction_revenue":finance,
                            "acquired_customer_period_revenue":self.repo.acquired_period_finance(f),
                            "acquired_customer_lifetime_revenue":acquired,
                            "acquired_customers":acquired["clientes_novos"],
                            "acquisition_month_net_revenue":acquired.get("faturamento_liquido_mes_aquisicao"),
                            "repurchase_90d":self.window(acquired,90),
                            "acquisition_growth_previous_period_pct":growth},period="separate_transaction_and_acquisition_periods",
                         population="explicit_company_and_acquired_customer_scopes",segmentation="transaction_attributes_for_company;first_purchase_attributes_for_acquired")

    def acquisition(self, f):
        rows=self.a.acquisition(f.analytical()).to_dicts()
        growth=self.a.acquisition_growth(f.analytical()).to_dicts()
        by_month={r["mes_aquisicao"]:r for r in rows}
        result=[]
        for g in growth:
            period=g["periodo"]; row=by_month.get(period)
            count=g["clientes_novos"]
            complete=period.year<self.a.reference_date.year or period.month<self.a.reference_date.month or self.a.reference_date.day==monthrange(period.year,period.month)[1]
            # Crescimento mensal apenas em recortes de meses completos.
            aligned=(not f.start_date or f.start_date.day==1) and (not f.end_date or f.end_date.day==monthrange(f.end_date.year,f.end_date.month)[1])
            result.append({"period":period,"new_customers":(row or {}).get("clientes_novos",0),
                           "first_purchase_accounting_revenue":row["valor_primeira_compra"] if row else 0,
                           "first_purchase_net_revenue":row["faturamento_liquido_primeira_compra"] if row else 0,
                           "first_purchase_gross_margin":row["margem_primeira_compra"] if row else 0,
                           "growth_pct":g["crescimento_mensal_percentual"] if complete and aligned else None})
        return self.wrap(f,self.bounded(result))

    def cohorts(self, f, max_months):
        observed=self.a.retention(f.analytical()).to_dicts()
        groups={}
        for r in observed:
            key=r["safra_aquisicao"]
            group=groups.setdefault(key,{"cohort":key,"initial_customers":r["clientes_observados"],"periods":{}})
            group["periods"][r["meses_desde_aquisicao"]]={
                "month_offset":r["meses_desde_aquisicao"],"eligible_customers":r["clientes_elegiveis"],
                "retained_customers":r["clientes_retidos"],"retention_pct":r["taxa_retencao"],
                "acquired_customers":r["clientes_adquiridos"],"mature":r["periodo_completo"],
                "net_revenue":r["faturamento_liquido_periodo"],"gross_margin":r["margem_bruta_valor_periodo"]}
        self.bounded(groups)
        if len(groups) * (max_months + 1) > MAX_COHORT_CELLS:
            raise ValueError("Matriz excede o limite; restrinja safras ou acompanhamento")
        for group in groups.values():
            group["periods"]=[group["periods"].get(i,{"month_offset":i,"eligible_customers":None,
                "retained_customers":None,"retention_pct":None,"acquired_customers":None,
                "mature":False,"net_revenue":None,"gross_margin":None}) for i in range(max_months+1)]
        return self.wrap(f,list(groups.values()),period="acquisition_with_monthly_follow_up")
