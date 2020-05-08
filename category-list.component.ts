import { Component, OnInit, ElementRef, ViewChild, Input, ChangeDetectionStrategy } from '@angular/core';
import { Validators, FormBuilder, FormGroup } from '@angular/forms';
// Material
import { MatPaginator, MatSort, MatDialog } from '@angular/material';
import { SelectionModel } from '@angular/cdk/collections';
// RXJS
import { debounceTime, distinctUntilChanged, tap } from 'rxjs/operators';
import { fromEvent, merge, BehaviorSubject } from 'rxjs';
// Services
import { LayoutUtilsService, MessageType } from '../../../../../_shared/utils/layout-utils.service';
import { ProjectCategoryService } from '../../../_core/services/index';
//User Access Role Service
import { UserAccessRolesService } from '../../../../../../../config/user-access-roles.service';
// Models
import { ProjectCategoryModel } from '../../../_core/models/project-category.model';
import { ProjectFieldsModel } from '../../../_core/models/project-fields.model';
import { ProjectCategoryDataSource } from '../../../_core/models/data-sources/project-category.datasource';
import { QueryParamsModel } from '../../../../../_shared/_core/models/query-models/query-params.model';
import { ListStateModel, StateActions } from '../../../../../_shared/_core/utils/list-state.model';
// Components
import { ProfileListDialogComponent } from '../../profiles/profile-list-dialog.component';
import {Location} from '@angular/common';

@Component({
	selector: 'm-category-list',
	templateUrl: './category-list.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class CategoryListComponent implements OnInit {
	// Incoming data
	@Input() loadingSubject = new BehaviorSubject<boolean>(false);
	@Input() categoryListState: ListStateModel;	
	// Table fields
	dataSource: ProjectCategoryDataSource;
	displayedColumns = ['id', 'name', 'actions'];
	@ViewChild(MatPaginator) paginator: MatPaginator;
	@ViewChild(MatSort) sort: MatSort;
	// Filter fields
	@ViewChild('searchInput') searchInput: ElementRef;
	// Selection
	selection = new SelectionModel<ProjectCategoryModel>(true, []);
	projectCategorysResult: ProjectCategoryModel[] = [];
	// Add and Edit
	isSwitchedToEditMode: boolean = false;
	loadingAfterSubmit: boolean = false;
	formGroup: FormGroup;
	categoryForEdit: ProjectCategoryModel;
	categoryForAdd: ProjectCategoryModel;	

	constructor(private projectCategoryService: ProjectCategoryService,
		private fb: FormBuilder,
		public dialog: MatDialog,
		public accessRoles: UserAccessRolesService,
		private _location: Location,
		private layoutUtilsService: LayoutUtilsService) { 
			if(!this.accessRoles.canViewProjectCategoryList()){
				this.goBack();
			}
	}

	/** LOAD DATA */
	ngOnInit() {
		// If the user changes the sort order, reset back to the first page.
		this.sort.sortChange.subscribe(() => (this.paginator.pageIndex = 0));
		/* Data load will be triggered in two cases:
		- when a pagination event occurs => this.paginator.page
		- when a sort event occurs => this.sort.sortChange
		**/
		merge(this.sort.sortChange, this.paginator.page)
			.pipe(
				tap(() => {
					this.loadCategorysList();
				})
			)
			.subscribe();

		// Filtration, bind to searchInput
		fromEvent(this.searchInput.nativeElement, 'keyup')
			.pipe(
				debounceTime(150),
				distinctUntilChanged(),
				tap(() => {
					this.paginator.pageIndex = 0;
					this.loadCategorysList();
				})
			)
			.subscribe();

		// Init DataSource
		this.dataSource = new ProjectCategoryDataSource(this.projectCategoryService);
		// this loading binded to parent component loading
		this.dataSource.loading$.subscribe(res => {
			this.loadingSubject.next(res);
		});
		this.loadCategorysList(true);
		this.dataSource.entitySubject.subscribe(res => this.projectCategorysResult = res);
		this.createFormGroup();
	}

	// Loading
	loadCategorysList(_isFirstLoading: boolean = false) {
		this.selection.clear();
		let queryParams = new QueryParamsModel(
			this.filterConfiguration(),
			this.sort.direction,
			this.sort.active,
			this.paginator.pageIndex,
			this.paginator.pageSize
		);
		if (_isFirstLoading) {
			queryParams = new QueryParamsModel(this.filterConfiguration(), 'desc', 'updatedAt', 0, 5);
		}
		this.dataSource.loadCategorys(queryParams, this.categoryListState);
	}

	// Add+Edit forms | FormGroup
	createFormGroup(_item = null) {
		// 'edit' prefix - for item editing
		// 'add' prefix - for item creation
		this.formGroup = this.fb.group({
			editName: ['', Validators.required],
			newName: ['', Validators.required],
			id: [''],
		});
		this.clearAddForm();
		this.clearEditForm();
	}

	// ADD REMARK FUNCTIONS: clearAddForm | checkAddForm | addCategoryButtonOnClick | cancelAddButtonOnClick | saveNewCategory
	clearAddForm() {
		const controls = this.formGroup.controls;
		controls['newName'].setValue('');
		controls['newName'].markAsPristine();
		controls['newName'].markAsUntouched();
		this.categoryForAdd = new ProjectCategoryModel();
		this.categoryForAdd.clear(this.categoryListState.entityId);		
		this.categoryForAdd._isEditMode = false;
	}

	checkAddForm() {
		const controls = this.formGroup.controls;
		if (controls['newName'].invalid) {
			controls['newName'].markAsTouched();
			return false;
		}
		return true;
	}

	addCategoryButtonOnClick() {
		this.clearAddForm();
		this.categoryForAdd._isEditMode = true;
		this.isSwitchedToEditMode = true;
	}

	cancelAddButtonOnClick() {
		this.categoryForAdd._isEditMode = false;
		this.isSwitchedToEditMode = false;
	}

	saveNewCategory() {
		if (!this.checkAddForm()) {
			return;
		}
		this.loadingAfterSubmit = true;
		const controls = this.formGroup.controls;		
		var _category = {};
		_category = {
			"name": controls['newName'].value,
			"projectId": this.categoryListState.entityId,
		}
		this.projectCategoryService.createCategory(_category).subscribe(res => {
			let _saveMessage = `The category has been created`;
			if( res !=undefined && res !=null && Object.keys(res).length>0 && res.status==0){
				_saveMessage=res.message;
			}
			this.loadingAfterSubmit = false;
			this.categoryForAdd._isEditMode = false;
			this.categoryListState.setItem(this.categoryForAdd, StateActions.CREATE);
			this.loadCategorysList();
			this.isSwitchedToEditMode = false;
			this.layoutUtilsService.showActionNotification(_saveMessage, MessageType.Create, 10000, true, false);
			this.clearAddForm();			
		},error=>{
			this.loadingAfterSubmit = false;
			this.categoryForAdd._isEditMode = false;
			this.isSwitchedToEditMode = false;
			this.layoutUtilsService.showActionNotification(error.error.message, MessageType.Update, 10000, true, false);
		})
		
	}

	// EDIT CATEGORY FUNCTIONS: clearEditForm | checkEditForm | editCategoryButtonOnClick | cancelEditButtonOnClick |
	clearEditForm() {
		const controls = this.formGroup.controls;
		controls['editName'].setValue('');		
		this.categoryForEdit = new ProjectCategoryModel();
		this.categoryForEdit.clear(this.categoryListState.entityId);		
		this.categoryForEdit._isEditMode = false;
	}

	checkEditForm() {
		const controls = this.formGroup.controls;
		if (controls['editName'].invalid) {
			controls['editName'].markAsTouched();
			return false;
		}
		return true;
	}

	editCategoryButtonOnClick(_item: ProjectCategoryModel) {
		const controls = this.formGroup.controls;
		controls['editName'].setValue(_item.name);
		controls['id'].setValue(_item.id);
		_item._isEditMode = true;
		this.isSwitchedToEditMode = true;
	}

	cancelEditButtonOnClick(_item: ProjectCategoryModel) {
		_item._isEditMode = false;
		this.isSwitchedToEditMode = false;
	}

	
	saveUpdatedCategory(_item: ProjectCategoryModel) {
		if (!this.checkEditForm()) {
			return;
		}
		this.loadingAfterSubmit = true;
		console.log("Update Category",_item);
		const controls = this.formGroup.controls;
		var _category = {};
		_category = {
			"name": controls['editName'].value,
			"id": controls['id'].value,
			"projectId": _item.project_id,
		}
		var __this =  this;
		this.projectCategoryService.updateCategory(_category).subscribe(res => {
			console.log(res);
			let saveMessage = `Category has been updated`;
			if( res !=undefined && res !=null && Object.keys(res).length>0 && res.status==0){
				saveMessage=res.message;
			}
			__this.loadingAfterSubmit = false;
			__this.categoryForAdd._isEditMode = false;
			__this.categoryListState.setItem(_item, StateActions.UPDATE);
			__this.loadCategorysList();
			__this.isSwitchedToEditMode = false;
			__this.layoutUtilsService.showActionNotification(saveMessage, MessageType.Update, 10000, true, false);
		},error=>{			
			__this.loadingAfterSubmit = false;
			__this.categoryForAdd._isEditMode = false;			
			__this.isSwitchedToEditMode = false;			
			this.layoutUtilsService.showActionNotification(error.error.message, MessageType.Update, 10000, true, false);
		});	
		
	}
	
	/** FILTRATION */
	filterConfiguration(): any {
		const filter: any = {
			'fileds':[],
			'term_query': null,
			'term_fields': null,
		};
		const searchText: string = this.searchInput.nativeElement.value;
		/*if (this.filterStatus && this.filterStatus.length > 0) {
			filter.fileds.push({'fieldName':'filter.status', 'fieldValue':this.filterStatus});
		}*/
		if(searchText){
			filter.term_query  = searchText;
			filter.term_fields = 'id,name';
		}
		return filter;
	}

	/** SELECTION */
	isAllSelected() {
		const numSelected = this.selection.selected.length;
		const numRows = this.projectCategorysResult.length;
		return numSelected === numRows;
	}

	/** Selects all rows if they are not all selected; otherwise clear selection. */
	masterToggle() {
		if (this.isAllSelected()) {
			this.selection.clear();
		} else {
			this.projectCategorysResult.forEach(row => this.selection.select(row));
		}
	}

	/** ACTIONS */
	/** Delete */
	deleteCategory(_item: ProjectCategoryModel) {
		const _title: string = 'Category Delete';
		const _description: string = 'Are you sure to permanently delete this category?';
		const _waitDesciption: string = 'Category is deleting...';
		const _deleteMessage = `Category has been deleted`;
		var __this = this;
		var _category = {
			"id":_item.id,
			"projectId":_item.project_id,
		}		
		const dialogRef = this.layoutUtilsService.deleteElement(_title, _description, _waitDesciption);
		dialogRef.afterClosed().subscribe(res => {
			if (!res) {
				return;
			}

			__this.projectCategoryService.deleteCategory(_category).subscribe(res => {			
				_item._isDeleted = true;
				__this.categoryListState.setItem(_item, StateActions.DELETE);
				__this.layoutUtilsService.showActionNotification(_deleteMessage, MessageType.Delete);
				__this.loadCategorysList();
				// Added By Rashmi Bug : ATS-51
				let displayData = __this.dataSource.entitySubject.getValue();
				if(displayData != undefined && displayData != null  && displayData.length < 2) {
					__this.paginator.previousPage();
				}
			},error=>{			
				_item._isDeleted = true;
				__this.categoryListState.setItem(_item, StateActions.DELETE);
				__this.layoutUtilsService.showActionNotification(error.error.message, MessageType.Delete);
			});
		});
	}

	deleteCategories() {
		const _title: string = 'Categorys Delete';
		const _description: string = 'Are you sure to permanently delete selected category?';
		const _waitDesciption: string = 'Categorys are deleting...';
		const _deleteMessage = 'Selected category have been deleted';

		const dialogRef = this.layoutUtilsService.deleteElement(_title, _description, _waitDesciption);
		dialogRef.afterClosed().subscribe(res => {
			if (!res) {
				return;
			}

			const length = this.selection.selected.length;
			for (let i = 0; i < length; i++) {
				this.selection.selected[i]._isDeleted = true;
				this.categoryListState.setItem(this.selection.selected[i], StateActions.DELETE);
			}
			this.layoutUtilsService.showActionNotification(_deleteMessage, MessageType.Delete);
			this.loadCategorysList();
			this.selection.clear();
		});
	}

	/* Add/Edit/List Project Profile By Selected Category */
	addProjectProfile(category) {
		let newProjectField = new ProjectFieldsModel();
		const dialogRef = this.dialog.open(ProfileListDialogComponent, {
			data: {
				projectId: category.project_id,
				categoryId: category.id,
				name: category.name,
				category: category,
				isNew: true,
			},
			width: '80%',
		});
		dialogRef.afterClosed().subscribe(res => {
			if (res && res.isUpdated == true) {
				this.categoryListState.setItem(newProjectField, StateActions.CREATE);				
				const saveMessage = res.message;
				this.layoutUtilsService.showActionNotification(saveMessage, MessageType.Create, 10000, true, false);
			}
		});
	}

	goBack(){
		this._location.back();
	}
	
}
