import {
    _,
    Autowired,
    ChartType,
    Component,
    Dialog,
    EventService,
    MessageBox,
    PostConstruct,
    RefSelector,
    ResizeObserverService
} from "ag-grid-community";
import {GridChartFactory} from "./gridChartFactory";
import {Chart} from "../../charts/chart/chart";
import {BarSeries} from "../../charts/chart/series/barSeries";
import {LineSeries} from "../../charts/chart/series/lineSeries";
import {PieSeries} from "../../charts/chart/series/pieSeries";
import colors from "../../charts/chart/colors";
import {CartesianChart} from "../../charts/chart/cartesianChart";
import {PolarChart} from "../../charts/chart/polarChart";
import {ChartMenu} from "./menu/chartMenu";
import {ChartModel} from "./chartModel";

export interface ChartOptions {
    insideDialog: boolean,
    showTooltips: boolean,
    height: number,
    width: number
}

export class GridChartComp extends Component {

    private static TEMPLATE =
        `<div class="ag-chart" tabindex="-1">
            <div ref="eChart" class="ag-chart-canvas-wrapper"></div>
             <div ref="eErrors" class="ag-chart-errors"></div>
        </div>`;

    @Autowired('resizeObserverService') private resizeObserverService: ResizeObserverService;
    @Autowired('eventService') private eventService: EventService;

    @RefSelector('eChart') private eChart: HTMLElement;
    @RefSelector('eErrors') private eErrors: HTMLElement;

    private readonly chartOptions: ChartOptions;
    private readonly chartModel: ChartModel;

    private chart: Chart<any, string, number>;
    private chartDialog: Dialog;
    private chartMenu: ChartMenu;

    private currentChartType: ChartType;
    private shouldDestroyDialog: boolean;

    constructor(chartOptions: ChartOptions, chartModel: ChartModel) {
        super(GridChartComp.TEMPLATE);

        this.chartOptions = chartOptions;
        this.chartModel = chartModel;

        this.currentChartType = chartModel.getChartType();
        this.chart = GridChartFactory.createChart(chartModel.getChartType(), chartOptions, this.eChart);
    }

    @PostConstruct
    private postConstruct(): void {

        const errors = this.chartModel.getErrors();
        const errorsExist = errors && errors.length > 0;
        if (errorsExist) {
            this.showErrorMessageBox();
            this.destroy();
            return;
        }

        if (this.chartOptions.insideDialog) {
            this.addDialog();
        }

        this.addMenu();
        this.addResizeListener();

        this.addDestroyableEventListener(this.getGui(), 'focusin', this.updateCellRange.bind(this));

        this.addDestroyableEventListener(this.chartModel, ChartModel.EVENT_CHART_MODEL_UPDATED, this.refresh.bind(this));
        this.addDestroyableEventListener(this.chartMenu, ChartMenu.EVENT_DOWNLOAD_CHART, this.downloadChart.bind(this));

        this.refresh();
    }

    private addDialog() {
        this.chartDialog = new Dialog({
            resizable: true,
            movable: true,
            title: 'Chart',
            component: this,
            centered: true,
            closable: true
        });
        this.getContext().wireBean(this.chartDialog);

        // by default function dialog's should also be destroyed along with the GridChartComp
        this.shouldDestroyDialog = true;

        this.chartDialog.addEventListener(Dialog.EVENT_DESTROYED, () => {
            // the dialog has been destroyed so don't invoke Dialog.destroy() again
            this.shouldDestroyDialog = false;
            this.destroy();
        });
    }

    private addMenu() {
        this.chartMenu = new ChartMenu(this.chartModel);
        this.getContext().wireBean(this.chartMenu);

        const eChart: HTMLElement = this.getGui();
        eChart.appendChild(this.chartMenu.getGui());
    }

    private refresh(): void {
        const eGui = this.getGui();

        const errors = this.chartModel.getErrors();
        const errorsExist = errors && errors.length > 0;

        _.setVisible(this.eChart, !errorsExist);
        _.setVisible(this.eErrors, errorsExist);

        if (errorsExist) {
            const html: string[] = [];

            //TODO: update error styles
            html.push(`Could not create chart:`);
            html.push(`<ul>`);
            errors.forEach(error => html.push(`<li>${error}</li>`));
            html.push(`</ul>`);

            eGui.innerHTML = html.join('');
        } else {
            if (this.chartModel.getChartType() !== this.currentChartType) {
                this.createNewChart();
            }
            this.updateChart();
        }
    }

    private showErrorMessageBox() {

        // TODO this message box get destroy when grid is destroyed
        const errorMessage = this.chartModel.getErrors().join(' ');

        const messageBox = new MessageBox({
            title: 'Charting Error',
            message: errorMessage,
            centered: true,
            resizable: false,
            movable: true,
            width: 400,
            height: 150
        });

        this.getContext().wireBean(messageBox);
    }

    public createNewChart() {
        // capture current chart dimensions so new chart is same size
        this.chartOptions.height = this.chart.height;
        this.chartOptions.width = this.chart.width;

        // destroy chart and remove it from DOM
        this.chart.destroy();
        _.clearElement(this.eChart);

        this.currentChartType = this.chartModel.getChartType();
        this.chart = GridChartFactory.createChart(this.chartModel.getChartType(), this.chartOptions, this.eChart);
    }

    public updateChart() {
        const chartType = this.chartModel.getChartType();

        if (chartType === ChartType.GroupedBar || chartType === ChartType.StackedBar) {
            this.updateBarChart();

        } else if (chartType === ChartType.Line) {
            this.updateLineChart();

        } else if (chartType === ChartType.Pie) {
            this.updatePieChart();
        }
    }

    private updateBarChart() {
        const data = this.chartModel.getData();
        const fields = this.chartModel.getFields();

        const barSeries = this.chart.series[0] as BarSeries<any, string, number>;

        barSeries.yFieldNames = this.chartModel.getFieldNames();
        barSeries.setDataAndFields(data, 'category', fields);
    }

    private updateLineChart() {
        const data = this.chartModel.getData();
        const fields = this.chartModel.getFields();

        const lineChart = this.chart as CartesianChart<any, string, number>;

        lineChart.removeAllSeries();

        lineChart.series = fields.map((field: string, index: number) => {
            const lineSeries = new LineSeries<any, string, number>();
            lineSeries.tooltip = this.chartOptions.showTooltips;
            lineSeries.lineWidth = 2;
            lineSeries.markerRadius = 3;
            lineSeries.color = colors[index % colors.length];

            lineSeries.setDataAndFields(data, 'category', field);

            return lineSeries;
        });
    }

    private updatePieChart() {
        const data = this.chartModel.getData();
        const fields = this.chartModel.getFields();

        const pieChart = this.chart as PolarChart<any, string, number>;

        const singleField = fields.length === 1;
        const thickness = singleField ? 0 : 20;
        const padding = singleField ? 0 : 10;
        let offset = 0;

        pieChart.removeAllSeries();

        pieChart.series = fields.map((field: string) => {
            const pieSeries = new PieSeries<any, string, number>();
            pieSeries.tooltip = this.chartOptions.showTooltips;
            pieSeries.lineWidth = 1;
            pieSeries.calloutWidth = 1;
            pieChart.addSeries(pieSeries);

            pieSeries.outerRadiusOffset = offset;
            offset -= thickness;
            pieSeries.innerRadiusOffset = offset;
            offset -= padding;

            pieSeries.data = data;
            pieSeries.angleField = field;

            return pieSeries;
        });
    }

    private downloadChart() {
        // TODO use chart / dialog title for filename
        this.chart.scene.download("chart");
    }

    private addResizeListener() {
        const eGui = this.getGui();

        const observeResize = this.resizeObserverService.observeResize(eGui, () => {
            if (!eGui || !eGui.offsetParent) {
                observeResize();
                return;
            }
            this.chart.height = _.getInnerHeight(eGui.parentElement as HTMLElement);
            this.chart.width = _.getInnerWidth(eGui.parentElement as HTMLElement);
        });
    }

    private updateCellRange(focusEvent: FocusEvent) {
        if (this.getGui().contains(focusEvent.relatedTarget as HTMLElement)) return;
        this.chartModel.updateCellRange();
    }

    public destroy(): void {
        super.destroy();

        if (this.chartModel) {
            this.chartModel.destroy();
        }
        if (this.chart) {
            this.chart.destroy();
        }
        if (this.chartMenu) {
            this.chartMenu.destroy();
        }

        // don't invoke Dialog.destroy() when this.destroy() originates from the dialog itself (prevents destroy loop)
        if (this.shouldDestroyDialog && this.chartDialog) {
            this.chartDialog.destroy();
        }

        // if the user is providing containers for the charts, we need to clean up, otherwise the old chart
        // data will still be visible although the chart is no longer bound to the grid
        _.clearElement(this.getGui());
    }
}